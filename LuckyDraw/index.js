/// <reference path="../../SparkBridgeDevelopTool/index.d.ts"/>

// ============================================
// LuckyDraw - 抽奖插件 v1.0.0
// 作者:I IKUN2004
// 修复所有指令问题
// ===========================I=================

const logger = spark.getLogger('LuckyDraw');
const configFile = spark.getFileHelper('LuckyDraw');
const msgbuilder = require('../../handles/msgbuilder');

// 默认配置
const defaultConfig = {
    targetGroup: 0,
    adminQQs: [],
    defaultDuration: 3600,
    maxParticipants: 500,
    cooldown: 30,
    autoDraw: true,
    requireBinding: true,
    notifyUnboundWinners: true,
    enableSmartMatch: true,
    enableClaimCommand: true,
    prizeStorageDays: 7,
    autoDistributeOnJoin: true,
    enableBeautify: true,
    enableMCBroadcast: true,
    broadcastNewLottery: false,
    enableCountdown: true,
    countdownTimes: [60, 30, 10, 5, 4, 3, 2, 1],
    enableExclamationPrefix: false,
    shortIdLength: 6,
    useAtForWinners: true,
    maxActiveLotteries: 5,
    allowMultipleJoins: false
};

configFile.initFile('config.json', defaultConfig);
const config = JSON.parse(configFile.getFile('config.json'));

// 数据存储
configFile.initFile('lotteries.json', { active: [], completed: [] });
configFile.initFile('pending_prizes.json', {});
configFile.initFile('player_cache.json', {});

// ============================================
// 辅助函数
// ============================================
function getMoneyAPI() {
    if (typeof money !== 'undefined') return money;
    if (typeof global !== 'undefined' && global.money) return global.money;
    return null;
}

function updateBalance(xuid, amount) {
    const m = getMoneyAPI();
    if (!m) return false;
    if (amount >= 0) return m.add(xuid, amount);
    else return m.reduce(xuid, -amount);
}

function canManageLottery(sender) {
    if (sender.role === 'owner') return true;
    const hasWhitelist = config.adminQQs && Array.isArray(config.adminQQs) && config.adminQQs.length > 0;
    if (hasWhitelist) {
        return config.adminQQs.map(String).includes(String(sender.user_id));
    } else {
        return sender.role === 'admin';
    }
}

function runCmdSilent(cmd) {
    if (!spark.onBDS || !mc || !mc.runcmdEx) return false;
    return mc.runcmdEx(cmd).success;
}

// ============================================
// 图标系统
// ============================================
const ICONS = {
    success: '✅',
    error: '❌',
    warning: '⚠️',
    info: 'ℹ️',
    gift: '🎁',
    lottery: '🎰',
    trophy: '🏆',
    clock: '⏰',
    person: '👤',
    diamond: '💎',
    star: '⭐',
    fire: '🔥',
    bell: '🔔',
    key: '🔑',
    mail: '📫',
    check: '✔️',
    chart: '📊',
    admin: '👑',
    lightning: '⚡',
    trash: '🗑️',
    money: '💰',
    countdown: '⏳'
};

// ============================================
// 指令别名系统 (完全修复版)
// ============================================
const COMMAND_ALIASES = {
    create: ['抽奖', '创建抽奖', '发起抽奖', '开始抽奖', '发起抽奖活动'],
    join: ['参与抽奖', '参加抽奖', '抽奖报名', '报名抽奖', '报名参加', '加入抽奖'],
    status: ['抽奖状态', '当前抽奖', '抽奖信息', '查看抽奖', '抽奖情况'],
    my: ['我的抽奖', '我的报名', '我的参与'],
    prize: ['我的奖品', '待领奖品', '奖品列表', '查看奖品'],
    claim: ['领取奖品', '领取奖励', '领取中奖'],
    help: ['抽奖帮助', '抽奖说明', '抽奖教程', '抽奖指南'],
    open: ['开奖', '立即开奖', '强制开奖', '开奖现在'],
    list: ['抽奖列表', '查看抽奖列表', '所有抽奖'],
    clear: ['清除抽奖', '清空抽奖', '重置抽奖'],  
    delete: ['删除抽奖', '移除抽奖', '取消抽奖'],
    config: ['抽奖配置', '查看配置', '配置查看'],
    set: ['设置抽奖', '抽奖设置', '修改配置'],
    stats: ['抽奖统计', '统计数据', '抽奖数据']
};

// ============================================
// 消息处理器
// ============================================
class MessageProcessor {
    static normalizeMessage(rawMessage) {
        if (config.enableExclamationPrefix) {
            return rawMessage.trim().replace(/^[!！]\s*/, '');
        }
        return rawMessage.trim();
    }
    
    static getCommand(rawMessage) {
        const normalized = this.normalizeMessage(rawMessage);
        return normalized.split(' ')[0];
    }
    
    static getArguments(rawMessage) {
        const normalized = this.normalizeMessage(rawMessage);
        const parts = normalized.split(' ');
        return parts.slice(1);
    }
    
    static isCommand(rawMessage, commandType) {
        const aliases = COMMAND_ALIASES[commandType];
        if (!aliases) return false;
        
        const command = this.getCommand(rawMessage);
        return aliases.includes(command);
    }
    
    static startsWithCommand(rawMessage, commandType) {
        const aliases = COMMAND_ALIASES[commandType];
        if (!aliases) return false;
        
        const normalized = this.normalizeMessage(rawMessage);
        for (const cmd of aliases) {
            if (normalized.startsWith(cmd)) {
                // 检查是否完全匹配或后面是空格/参数
                if (normalized === cmd || normalized.startsWith(cmd + ' ')) {
                    return true;
                }
            }
        }
        return false;
    }
    
    static getFullCommand(rawMessage) {
        const normalized = this.normalizeMessage(rawMessage);
        return normalized;
    }
}

// ============================================
// ID生成器
// ============================================
class IDGenerator {
    static generateLotteryId() {
        return Math.floor(100000 + Math.random() * 900000).toString();
    }
    
    static isValidId(id) {
        return /^[0-9]{6}$/.test(id);
    }
}

// ============================================
// 时间单位转换器
// ============================================
class TimeConverter {
    static parseTimeToSeconds(timeStr) {
        if (!timeStr) return 3600;
        const timeStrLower = timeStr.toLowerCase().trim();
        const match = timeStrLower.match(/^(\d+(?:\.\d+)?)\s*([smh]?)$/);
        if (!match) return 3600;
        const value = parseFloat(match[1]);
        const unit = match[2] || 'h';
        const unitMap = { 's': 1, 'm': 60, 'h': 3600 };
        const seconds = value * (unitMap[unit] || 3600);
        return Math.max(10, Math.min(604800, seconds));
    }
    
    static formatSeconds(seconds) {
        if (seconds < 60) return `${Math.round(seconds)}秒`;
        if (seconds < 3600) return `${Math.round(seconds / 60)}分钟`;
        if (seconds < 86400) return `${(seconds / 3600).toFixed(1)}小时`;
        return `${(seconds / 86400).toFixed(1)}天`;
    }
    
    static formatSecondsDetailed(seconds) {
        const days = Math.floor(seconds / 86400);
        const hours = Math.floor((seconds % 86400) / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);
        const parts = [];
        if (days > 0) parts.push(`${days}天`);
        if (hours > 0) parts.push(`${hours}小时`);
        if (minutes > 0) parts.push(`${minutes}分钟`);
        if (secs > 0 || parts.length === 0) parts.push(`${secs}秒`);
        return parts.join(' ');
    }
}

// ============================================
// 绑定验证管理器
// ============================================
class BindingManager {
    static getBoundGameId(qq) {
        try {
            if (spark.mc && typeof spark.mc.getXbox === 'function') {
                const gameId = spark.mc.getXbox(qq);
                if (gameId && gameId !== 'undefined' && gameId.trim() !== '') {
                    return gameId.trim();
                }
            }
            return null;
        } catch (error) { return null; }
    }
    
    static async getPlayerGameId(qq, qqName) {
        const boundId = this.getBoundGameId(qq);
        if (boundId) return { id: boundId, source: 'binding' };
        return null;
    }
    
    static isPlayerOnline(gameId) {
        if (!spark.onBDS || !mc || !mc.getOnlinePlayers) return false;
        try {
            const players = mc.getOnlinePlayers();
            if (!players) return false;
            return players.some(player => player.name?.trim().toLowerCase() === gameId.toLowerCase());
        } catch (error) { return false; }
    }
}

// ============================================
// 奖品存储管理器
// ============================================
class PrizeStorageManager {
    static storePrizeForPlayer(gameId, prize, lotteryId, reason = 'offline') {
        try {
            const storage = JSON.parse(configFile.getFile('pending_prizes.json') || '{}');
            if (!storage[gameId]) storage[gameId] = [];
            storage[gameId].push({
                prize: prize,
                lotteryId: lotteryId,
                storedAt: Date.now(),
                expiresAt: Date.now() + (config.prizeStorageDays * 86400000),
                reason: reason,
                status: 'pending'
            });
            storage[gameId] = storage[gameId].filter(item => item.expiresAt > Date.now());
            configFile.updateFile('pending_prizes.json', storage);
            return true;
        } catch (error) { return false; }
    }
    
    static getPendingPrizes(gameId) {
        try {
            const storage = JSON.parse(configFile.getFile('pending_prizes.json') || '{}');
            return storage[gameId] || [];
        } catch (error) { return []; }
    }
    
    static removePendingPrize(gameId, prizeIndex) {
        try {
            const storage = JSON.parse(configFile.getFile('pending_prizes.json') || '{}');
            if (storage[gameId] && storage[gameId][prizeIndex]) {
                storage[gameId].splice(prizeIndex, 1);
                if (storage[gameId].length === 0) delete storage[gameId];
                configFile.updateFile('pending_prizes.json', storage);
                return true;
            }
            return false;
        } catch (error) { return false; }
    }
}

// ============================================
// 奖池瓜分工具类
// ============================================
class PrizeSplitter {
    static parse(prizeStr) {
        const match = prizeStr.match(/^(\d+)?\s*(.+)$/);
        if (!match) return { amount: 1, name: prizeStr, isMoney: false };
        
        const rawAmount = match[1];
        const name = match[2].trim();
        let amount = rawAmount ? parseInt(rawAmount) : 1;
        const isMoney = /^(金币|money|钱)$/i.test(name) || /^\d+$/.test(prizeStr);
        
        if (/^\d+$/.test(prizeStr)) {
            amount = parseInt(prizeStr);
            return { amount: amount, name: "金币", isMoney: true };
        }
        return { amount, name, isMoney };
    }
    
    static split(total, count) {
        if (count <= 0) return [];
        if (count === 1) return [total];
        if (total < count) return new Array(count).fill(1);
        
        const result = [];
        let remainingAmount = total;
        let remainingCount = count;
        
        for (let i = 0; i < count - 1; i++) {
            const max = Math.floor(remainingAmount / remainingCount * 2);
            const amount = Math.max(1, Math.floor(Math.random() * max));
            result.push(amount);
            remainingAmount -= amount;
            remainingCount--;
        }
        result.push(remainingAmount);
        return result.sort(() => Math.random() - 0.5);
    }
}

// ============================================
// 奖品分发器
// ============================================
class PrizeDistributor {
    static async givePrizeToPlayer(gameId, prize) {
        if (!spark.onBDS) return false;
        
        const parsed = PrizeSplitter.parse(prize);
        
        if (parsed.isMoney) {
            const player = mc.getPlayer(gameId);
            const m = getMoneyAPI();
            if (m && player) {
                const success = updateBalance(player.xuid, parsed.amount);
                if (success) {
                    logger.info(`[API] 已给玩家 ${gameId} 发放 ${parsed.amount} 金币`);
                    this.sendColorfulAnnouncement(gameId, prize);
                    return true;
                }
            }
            
            if (mc.runcmdEx) {
                const result = mc.runcmdEx(`money add "${gameId}" ${parsed.amount}`);
                if (result.success) {
                    this.sendColorfulAnnouncement(gameId, prize);
                    return true;
                }
            }
            return false;
        }

        if (!mc || !mc.runcmdEx) return false;
        try {
            const commandPrizeStr = `${parsed.amount} ${parsed.name}`;
            const command = this.parsePrizeToCommand(commandPrizeStr, gameId);
            if (!command) return false;
            
            const result = runCmdSilent(command);
            if (result) {
                this.sendColorfulAnnouncement(gameId, commandPrizeStr);
                return true;
            }
            return false;
        } catch (error) { return false; }
    }
    
    static sendColorfulAnnouncement(gameId, prize) {
        try {
            if (!spark.onBDS || !mc) return;
            runCmdSilent(`title "${gameId}" title §e恭喜中奖!`);
            runCmdSilent(`title "${gameId}" subtitle §f获得: §a${prize}`);
            runCmdSilent(`execute as "${gameId}" at @s run playsound random.levelup @s ~ ~ ~ 1 1`);
        } catch (error) {}
    }
    
    static parsePrizeToCommand(prize, gameId) {
        const prizeMap = {
            '钻石': 'diamond', '金锭': 'gold_ingot', '铁锭': 'iron_ingot',
            '绿宝石': 'emerald', '下界合金锭': 'netherite_ingot',
            '青金石': 'lapis_lazuli', '红石': 'redstone', '煤炭': 'coal',
            '附魔金苹果': 'enchanted_golden_apple'
        };
        const match = prize.match(/(\d+)?\s*(.+)/);
        if (!match) return null;
        const count = match[1] || '1';
        const itemName = match[2].trim();
        const itemId = prizeMap[itemName] || itemName;
        return `give "${gameId}" ${itemId} ${count}`;
    }
}

// ============================================
// 美化回复系统
// ============================================
class BeautifiedReplier {
    static beautify(type, data = {}) {
        if (!config.enableBeautify) return data.message || type;
        
        const templates = {
            lottery_created: `${ICONS.success} 抽奖创建成功！\n\n${ICONS.gift} 奖品: ${data.prize || ''}\n${ICONS.person} 名额: ${data.winners || ''}个\n${ICONS.clock} 时长: ${data.duration || ''}\n${ICONS.check} 抽奖ID: ${data.lotteryId || ''}\n\n${ICONS.info} 使用 参与抽奖 参与抽奖`,
            join_success: `${ICONS.success} 参与成功\n${data.message || ''}\n${ICONS.star} 祝你好运！`,
            join_failed: `${ICONS.error} 参与失败\n${data.reason || ''}`,
            need_binding: `${ICONS.warning} 需要绑定\n请先绑定游戏ID才能参与抽奖！\n${ICONS.info} 使用指令: 绑定 你的游戏ID`,
            no_active_lottery: `${ICONS.info} 当前没有活跃的抽奖活动`,
            lottery_status: `${ICONS.chart} 当前抽奖\n${ICONS.gift} 奖品: ${data.prize || ''}\n${ICONS.person} 已参与: ${data.participants || 0}人\n${ICONS.clock} 剩余时间: ${data.timeLeft || ''}\n${ICONS.check} 抽奖ID: ${data.lotteryId || ''}\n\n${ICONS.info} 使用 参与抽奖 参加`,
            my_lotteries_title: `${ICONS.info} 您参与的抽奖`,
            my_prizes_title: `${ICONS.gift} 待领取奖品`,
            success_message: `${ICONS.success} ${data.message || '操作成功'}`,
            error_message: `${ICONS.error} ${data.message || '操作失败'}`,
            info_message: `${ICONS.info} ${data.message || ''}`,
            admin_draw_now: `${ICONS.lightning} 管理员强制开奖\n${ICONS.gift} 奖品: ${data.prize || ''}\n${ICONS.person} 已开奖，共 ${data.winnerCount || 0} 位中奖者\n${ICONS.info} 奖品正在发放中...`,
            lottery_ended: `${ICONS.info} 抽奖 ${data.prize || ''} 已结束\n${ICONS.warning} ${data.reason || '无人参与，抽奖取消'}`,
            clear_success: `${ICONS.trash} 清除成功\n${ICONS.success} ${data.message || '所有抽奖数据已清除'}`,
            delete_success: `${ICONS.trash} 删除成功\n${ICONS.success} 抽奖 ${data.lotteryId || ''} 已删除`,
            config_info: `${ICONS.info} 当前抽奖插件配置：\n\n🎰 活动群号: ${data.targetGroup || '未设置'}\n⏰ 默认时长: ${data.defaultDuration}秒\n👥 最大人数: ${data.maxParticipants}\n⏱️ 参与冷却: ${data.cooldown}秒\n🔗 必须绑定: ${data.requireBinding ? '是' : '否'}\n🤖 智能匹配: ${data.enableSmartMatch ? '启用' : '禁用'}\n🎮 MC广播: ${data.enableMCBroadcast ? '启用' : '禁用'}\n📦 奖品存储: ${data.prizeStorageDays}天\n⚡ 上线发放: ${data.autoDistributeOnJoin ? '启用' : '禁用'}\n🎨 美化回复: ${data.enableBeautify ? '启用' : '禁用'}\n⏳ 倒计时: ${data.enableCountdown ? '启用' : '禁用'}\n❕ 感叹号前缀: ${data.enableExclamationPrefix ? '启用' : '禁用'}\n🔔 艾特中奖者: ${data.useAtForWinners ? '启用' : '禁用'}\n📈 最大活跃抽奖: ${data.maxActiveLotteries}个`
        };
        
        let template = templates[type];
        if (!template) return type;
        
        for (const [key, value] of Object.entries(data)) {
            template = template.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
        }
        return template;
    }
}

// ============================================
// LotteryManager 类
// ============================================
class LotteryManager {
    constructor() {
        this.activeLotteries = new Map();
        this.userCooldowns = new Map();
        this.lotteryIdMap = new Map();
        this.loadLotteries();
        this.startTimers();
        this.startCleanupTimer();
        logger.info('抽奖管理器初始化完成');
    }
    
    createLottery(params) {
        const activeCount = this.getAllActiveLotteries(params.group).length;
        if (activeCount >= config.maxActiveLotteries) {
            return null;
        }
        
        const lotteryId = `lottery_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
        const shortId = IDGenerator.generateLotteryId();
        
        const lottery = {
            id: lotteryId,
            shortId: shortId,
            ...params,
            participants: [],
            winners: [],
            status: 'open',
            createdAt: Date.now(),
            drawAt: Date.now() + (params.duration * 1000),
            requireBinding: config.requireBinding,
            formattedDuration: TimeConverter.formatSecondsDetailed(params.duration),
            announcedTimes: [],
            lastChecked: Date.now()
        };
        
        this.activeLotteries.set(lotteryId, lottery);
        this.lotteryIdMap.set(shortId, lotteryId);
        this.saveLotteries();
        
        logger.info(`创建抽奖: ${lottery.prize}, ID: ${shortId}`);
        return lotteryId;
    }
    
    async joinLottery(lotteryId, user) {
        const lottery = this.getLotteryById(lotteryId);
        if (!lottery) return { success: false, reason: BeautifiedReplier.beautify('error_message', { message: '抽奖不存在' }) };
        
        if (lottery.status !== 'open') {
            return { success: false, reason: BeautifiedReplier.beautify('error_message', { message: `抽奖已${lottery.status === 'drawn' ? '开奖' : '结束'}` }) };
        }
        
        if (Date.now() > lottery.drawAt) {
            lottery.status = 'closed';
            lottery.closeReason = '时间到期自动关闭';
            this.saveLotteries();
            return { success: false, reason: BeautifiedReplier.beautify('error_message', { message: '抽奖已过期' }) };
        }
        
        if (this.isInCooldown(user.user_id, lotteryId)) {
            return { success: false, reason: BeautifiedReplier.beautify('join_failed', { reason: '请稍后再试' }) };
        }
        
        if (lottery.participants.some(p => p.qq === user.user_id)) {
            return { success: false, reason: BeautifiedReplier.beautify('join_failed', { reason: '您已参与本次抽奖' }) };
        }
        
        const playerInfo = await BindingManager.getPlayerGameId(user.user_id, user.nickname);
        if (!playerInfo) return { success: false, reason: BeautifiedReplier.beautify('need_binding', {}) };
        
        const { id: gameId, source } = playerInfo;
        const participantName = user.card || user.nickname || String(user.user_id);
        
        lottery.participants.push({
            qq: user.user_id,
            name: participantName, 
            gameId: gameId,
            joinTime: Date.now(),
            isBound: true,
            bindSource: source
        });
        
        this.setCooldown(user.user_id, lotteryId, config.cooldown);
        this.saveLotteries();
        
        const message = `参与成功！(${source === 'binding' ? '已绑定' : '智能匹配'}: ${gameId})`;
        return { 
            success: true, 
            message: BeautifiedReplier.beautify('join_success', { message }), 
            gameId: gameId, 
            bindSource: source 
        };
    }
    
    async drawLottery(lotteryId) {
        const lottery = this.getLotteryById(lotteryId);
        if (!lottery) return null;
        if (lottery.status !== 'open') return { success: false, reason: `抽奖状态为 ${lottery.status}，无法开奖` };
        
        const parsedPrize = PrizeSplitter.parse(lottery.prize);
        let maxPossibleWinners = Math.min(lottery.totalWinners, lottery.participants.length);
        if (maxPossibleWinners > parsedPrize.amount) maxPossibleWinners = parsedPrize.amount;
        
        if (lottery.participants.length === 0) {
            lottery.status = 'closed';
            lottery.closeReason = '无人参与';
            this.saveLotteries();
            spark.QClient.sendGroupMsg(lottery.group, BeautifiedReplier.beautify('lottery_ended', { prize: lottery.prize, reason: '无人参与，抽奖取消' }));
            return { success: false, reason: '无人参与' };
        }
        
        const shuffled = [...lottery.participants].sort(() => Math.random() - 0.5);
        const winners = shuffled.slice(0, maxPossibleWinners);
        const shares = PrizeSplitter.split(parsedPrize.amount, winners.length);
        
        lottery.winners = winners.map((w, index) => {
            const shareAmount = shares[index];
            const specificPrize = parsedPrize.isMoney ? `${shareAmount}金币` : `${shareAmount} ${parsedPrize.name}`;
            return { 
                ...w, 
                wonAmount: shareAmount, 
                wonPrize: specificPrize 
            };
        });
        
        lottery.status = 'drawn';
        lottery.drawnAt = Date.now();
        lottery.actualWinners = winners.length;
        
        this.saveLotteries();
        const results = await this.handlePrizeDistribution(lottery);
        this.announceDrawResults(lottery, results);
        
        return { success: true, lottery: lottery, results: results };
    }
    
    async drawNow(lotteryId) {
        const lottery = this.getLotteryById(lotteryId);
        if (!lottery) return { success: false, reason: '未找到指定的抽奖' };
        if (lottery.status === 'drawn') return { success: false, reason: '抽奖已开奖' };
        if (lottery.status === 'closed') lottery.status = 'open';
        logger.info(`管理员强制开奖: ${lottery.prize}`);
        return await this.drawLottery(lottery.id);
    }
    
    async handlePrizeDistribution(lottery) {
        const results = { immediate: [], stored: [], failed: [] };
        for (const winner of lottery.winners) {
            if (!winner.gameId) {
                results.failed.push({ name: winner.name, reason: '无游戏ID', prize: winner.wonPrize });
                continue;
            }
            
            const isOnline = BindingManager.isPlayerOnline(winner.gameId);
            if (isOnline) {
                const success = await PrizeDistributor.givePrizeToPlayer(winner.gameId, winner.wonPrize);
                if (success) {
                    results.immediate.push({ name: winner.name, gameId: winner.gameId, prize: winner.wonPrize });
                } else {
                    const stored = PrizeStorageManager.storePrizeForPlayer(winner.gameId, winner.wonPrize, lottery.id, 'distribute_failed');
                    if (stored) results.stored.push({ name: winner.name, gameId: winner.gameId, prize: winner.wonPrize, reason: '发放失败，已存储' });
                }
            } else {
                const stored = PrizeStorageManager.storePrizeForPlayer(winner.gameId, winner.wonPrize, lottery.id, 'offline');
                if (stored) results.stored.push({ name: winner.name, gameId: winner.gameId, prize: winner.wonPrize, reason: '玩家不在线，已存储' });
            }
        }
        return results;
    }
    
    getLatestLottery(groupId) {
        let latest = null;
        const now = Date.now();
        
        for (const lottery of this.activeLotteries.values()) {
            if (lottery.group == groupId && lottery.status === 'open') {
                if (now > lottery.drawAt) {
                    lottery.status = 'closed';
                    lottery.closeReason = '时间到期自动关闭';
                    lottery.lastChecked = now;
                    this.saveLotteries();
                    continue;
                }
                
                if (!latest || lottery.createdAt > latest.createdAt) {
                    latest = lottery;
                }
            }
        }
        return latest;
    }
    
    getLotteryStatus(lotteryId) {
        const lottery = this.getLotteryById(lotteryId);
        if (!lottery) return null;
        
        const timeLeft = Math.ceil((lottery.drawAt - Date.now()) / 1000);
        return {
            prize: lottery.prize,
            participants: lottery.participants.length,
            timeLeft: Math.max(0, timeLeft),
            timeLeftText: TimeConverter.formatSecondsDetailed(Math.max(0, timeLeft)),
            totalWinners: lottery.totalWinners,
            status: lottery.status,
            isExpired: lottery.drawAt <= Date.now(),
            lotteryId: lottery.shortId
        };
    }
    
    getLotteryById(lotteryId) {
        if (this.activeLotteries.has(lotteryId)) {
            return this.activeLotteries.get(lotteryId);
        }
        
        if (IDGenerator.isValidId(lotteryId)) {
            const fullId = this.lotteryIdMap.get(lotteryId);
            if (fullId && this.activeLotteries.has(fullId)) {
                return this.activeLotteries.get(fullId);
            }
        }
        
        for (const lottery of this.activeLotteries.values()) {
            if (lottery.shortId === lotteryId) {
                return lottery;
            }
        }
        
        return null;
    }
    
    getAllActiveLotteries(groupId) {
        const lotteries = [];
        const now = Date.now();
        
        for (const lottery of this.activeLotteries.values()) {
            if (lottery.group == groupId && lottery.status === 'open') {
                if (now > lottery.drawAt) {
                    lottery.status = 'closed';
                    lottery.closeReason = '时间到期自动关闭';
                    lottery.lastChecked = now;
                    this.saveLotteries();
                    continue;
                }
                lotteries.push(lottery);
            }
        }
        return lotteries;
    }
    
    announceDrawResults(lottery, results) {
        try {
            // 构建中奖者名单
            const winnerSegments = [];
            
            if (config.useAtForWinners && lottery.winners.length > 0) {
                lottery.winners.forEach((w, index) => {
                    if (index > 0) winnerSegments.push(msgbuilder.text(', '));
                    winnerSegments.push(msgbuilder.at(w.qq));
                    winnerSegments.push(msgbuilder.text(`(${w.wonAmount})`));
                });
            } else {
                winnerSegments.push(msgbuilder.text(lottery.winners.map(w => `${w.name || w.gameId || '未知'}(${w.wonAmount})`).join(', ')));
            }
            
            // 构建主消息
            const durationText = TimeConverter.formatSecondsDetailed(Math.floor((lottery.drawnAt - lottery.createdAt) / 1000));
            
            const mainMessage = [
                msgbuilder.text(`${ICONS.bell} 抽奖开奖完成\n\n`),
                msgbuilder.text(`${ICONS.gift} 奖品: ${lottery.prize}\n`),
                msgbuilder.text(`${ICONS.clock} 持续时间: ${durationText}\n`),
                msgbuilder.text(`${ICONS.person} 参与人数: ${lottery.participants.length}人\n`),
                msgbuilder.text(`${ICONS.trophy} 中奖者: `),
                ...winnerSegments,
                msgbuilder.text(`\n\n${ICONS.info} 奖品已随机分配并在游戏中发放`)
            ];
            
            spark.QClient.sendGroupMsg(lottery.group, msgbuilder.format(mainMessage));
            
            // 存储奖品通知
            if (results.stored.length > 0) {
                setTimeout(() => {
                    const storedSegments = [];
                    if (config.useAtForWinners) {
                        results.stored.forEach((r, index) => {
                            if (index > 0) storedSegments.push(msgbuilder.text(', '));
                            const winner = lottery.winners.find(w => w.gameId === r.gameId);
                            if (winner) {
                                storedSegments.push(msgbuilder.at(winner.qq));
                                storedSegments.push(msgbuilder.text(`(${r.prize})`));
                            } else {
                                storedSegments.push(msgbuilder.text(`${r.name || '未知'}(${r.prize})`));
                            }
                        });
                    } else {
                        storedSegments.push(msgbuilder.text(results.stored.map(r => `${r.name || '未知'}(${r.prize})`).join(', ')));
                    }
                    
                    const storedMessage = [
                        msgbuilder.text(`${ICONS.mail} 以下玩家的奖品已存储（玩家不在线）:\n`),
                        ...storedSegments,
                        msgbuilder.text(`\n\n${ICONS.info} 请在游戏中在线后使用 我的奖品 查看`)
                    ];
                    
                    spark.QClient.sendGroupMsg(lottery.group, msgbuilder.format(storedMessage));
                }, 1000);
            }
        } catch (error) {
            logger.error(`开奖结果发送失败: ${error}`);
            // 使用纯文本作为备选
            const winnerList = lottery.winners.map(w => `${w.name || w.gameId || '未知'}(${w.wonAmount})`).join(', ');
            const durationText = TimeConverter.formatSecondsDetailed(Math.floor((lottery.drawnAt - lottery.createdAt) / 1000));
            const qqMessage = `${ICONS.bell} 抽奖开奖完成\n\n${ICONS.gift} 奖品: ${lottery.prize}\n${ICONS.clock} 持续时间: ${durationText}\n${ICONS.person} 参与人数: ${lottery.participants.length}人\n${ICONS.trophy} 中奖者: ${winnerList}\n\n${ICONS.info} 奖品已随机分配并在游戏中发放`;
            spark.QClient.sendGroupMsg(lottery.group, qqMessage);
        }
    }
    
    clearAllLotteries() {
        const count = this.activeLotteries.size;
        this.activeLotteries.clear();
        this.userCooldowns.clear();
        this.lotteryIdMap.clear();
        configFile.updateFile('lotteries.json', { active: [], completed: [] });
        configFile.updateFile('pending_prizes.json', {});
        configFile.updateFile('player_cache.json', {});
        logger.info(`清除所有抽奖数据，共 ${count} 个抽奖`);
        return count;
    }
    
    deleteLottery(lotteryId) {
        // 尝试用短ID查找
        const lottery = this.getLotteryById(lotteryId);
        if (!lottery) {
            return false;
        }
        
        this.activeLotteries.delete(lottery.id);
        this.lotteryIdMap.delete(lottery.shortId);
        this.saveLotteries();
        logger.info(`抽奖 ${lottery.shortId} 已被删除`);
        return true;
    }
    
    getStatistics() {
        const stats = { 
            totalLotteries: this.activeLotteries.size, 
            openLotteries: 0, 
            drawnLotteries: 0, 
            closedLotteries: 0, 
            totalParticipants: 0, 
            totalWinners: 0 
        };
        
        for (const lottery of this.activeLotteries.values()) {
            if (lottery.status === 'open') stats.openLotteries++;
            else if (lottery.status === 'drawn') stats.drawnLotteries++;
            else if (lottery.status === 'closed') stats.closedLotteries++;
            
            stats.totalParticipants += lottery.participants.length;
            stats.totalWinners += lottery.winners.length;
        }
        
        return stats;
    }
    
    saveLotteries() {
        try {
            const activeArray = Array.from(this.activeLotteries.values());
            configFile.updateFile('lotteries.json', { active: activeArray, completed: [] });
        } catch (error) {
            logger.error(`保存抽奖数据失败: ${error}`);
        }
    }
    
    loadLotteries() {
        try {
            const data = JSON.parse(configFile.getFile('lotteries.json') || '{"active":[], "completed":[]}');
            data.active = data.active || [];
            let loadedCount = 0;
            
            data.active.forEach(lottery => {
                if (!lottery.participants) lottery.participants = [];
                if (!lottery.winners) lottery.winners = [];
                if (!lottery.status) lottery.status = 'open';
                if (!lottery.announcedTimes) lottery.announcedTimes = [];
                if (!lottery.lastChecked) lottery.lastChecked = Date.now();
                
                if (!lottery.shortId) {
                    lottery.shortId = IDGenerator.generateLotteryId();
                }
                
                if (lottery.status === 'open' && Date.now() > lottery.drawAt) {
                    lottery.status = 'closed';
                    lottery.closeReason = '加载时发现过期自动关闭';
                }
                
                this.activeLotteries.set(lottery.id, lottery);
                this.lotteryIdMap.set(lottery.shortId, lottery.id);
                loadedCount++;
            });
            
            logger.info(`加载了 ${loadedCount} 个抽奖`);
        } catch (error) {
            logger.error(`加载抽奖数据失败: ${error}`);
            this.activeLotteries.clear();
            this.lotteryIdMap.clear();
        }
    }
    
    isInCooldown(qq, lotteryId) {
        const key = `${qq}_${lotteryId}`;
        const cooldown = this.userCooldowns.get(key);
        return cooldown && cooldown > Date.now();
    }
    
    setCooldown(qq, lotteryId, seconds) {
        const key = `${qq}_${lotteryId}`;
        this.userCooldowns.set(key, Date.now() + (seconds * 1000));
        setTimeout(() => {
            if (this.userCooldowns.get(key) <= Date.now()) {
                this.userCooldowns.delete(key);
            }
        }, seconds * 1000 + 1000);
    }
    
    startTimers() {
        const checkInterval = 1000;
        this.drawCheckTimer = setInterval(() => {
            try {
                const now = Date.now();
                for (const [id, lottery] of this.activeLotteries.entries()) {
                    if (lottery.status === 'open') {
                        if (lottery.drawAt <= now) {
                            this.drawLottery(id);
                            continue;
                        }
                        
                        if (config.enableCountdown) {
                            const remaining = Math.floor((lottery.drawAt - now) / 1000);
                            if (config.countdownTimes.includes(remaining) && !lottery.announcedTimes.includes(remaining)) {
                                this.broadcastCountdown(lottery, remaining);
                                lottery.announcedTimes.push(remaining);
                            }
                        }
                    }
                }
            } catch (error) {
                logger.error(`定时器错误: ${error}`);
            }
        }, checkInterval);
    }
    
    broadcastCountdown(lottery, seconds) {
        if (!spark.onBDS || !mc || !mc.runcmdEx) return;
        
        if (seconds <= 10) {
            let color = "§a";
            if (seconds <= 5) color = "§c";
            else if (seconds <= 10) color = "§e";
            
            runCmdSilent(`title @a title ${color}${seconds}`);
            runCmdSilent(`title @a subtitle §7距离[${lottery.prize}]开奖仅剩...`);
            
            const pitch = 1.0 + (10 - seconds) * 0.05;
            runCmdSilent(`execute as @a at @s run playsound random.orb @s ^ ^ ^ 1 ${pitch}`);
        } else {
            runCmdSilent(`tellraw @a {"rawtext":[{"text":"§e[抽奖提醒] §f距离 §b${lottery.prize} §f开奖仅剩 §c${seconds}秒§f！"}]}`);
            runCmdSilent(`execute as @a at @s run playsound random.orb @s ^ ^ ^ 1 1`);
        }
    }
    
    startCleanupTimer() {
        const cleanupInterval = 5 * 60 * 1000;
        this.cleanupTimer = setInterval(() => {
            try {
                this.cleanupExpiredLotteries();
            } catch (error) {
                logger.error(`清理定时器错误: ${error}`);
            }
        }, cleanupInterval);
    }
    
    cleanupExpiredLotteries() {
        const now = Date.now();
        let cleanedCount = 0;
        
        for (const [id, lottery] of this.activeLotteries.entries()) {
            if (now - lottery.createdAt > 7 * 86400000) {
                this.activeLotteries.delete(id);
                this.lotteryIdMap.delete(lottery.shortId);
                cleanedCount++;
            }
            else if (lottery.status === 'drawn' && (now - lottery.drawnAt > 3 * 86400000)) {
                this.activeLotteries.delete(id);
                this.lotteryIdMap.delete(lottery.shortId);
                cleanedCount++;
            }
            else if (lottery.status === 'closed' && (now - (lottery.closedAt || lottery.drawAt) > 86400000)) {
                this.activeLotteries.delete(id);
                this.lotteryIdMap.delete(lottery.shortId);
                cleanedCount++;
            }
        }
        
        if (cleanedCount > 0) {
            this.saveLotteries();
            logger.debug(`清理了 ${cleanedCount} 个过期抽奖`);
        }
    }
}

// ============================================
// 指令解析器
// ============================================
function parseLotteryCommand(rawCmd, sender, group) {
    try {
        const args = rawCmd.trim();
        if (!args) return null;
        
        // 提取指令后的参数
        const cmdMatch = args.match(/^(抽奖|创建抽奖|发起抽奖|开始抽奖)\s+(.+)$/i);
        if (!cmdMatch) return null;
        
        const paramsStr = cmdMatch[2];
        
        // 解析参数：奖品 名额 时长
        const paramMatch = paramsStr.match(/^(.+?)\s+(\d+)(?:\s+(\d+(?:\.\d+)?)\s*([smh]?))?$/i);
        if (!paramMatch) return null;
        
        const prize = paramMatch[1].trim();
        const totalWinners = parseInt(paramMatch[2]);
        const timeStr = paramMatch[3] ? `${paramMatch[3]}${paramMatch[4] || 'h'}` : '1h';
        
        if (!prize || prize.length === 0 || isNaN(totalWinners) || totalWinners < 1 || totalWinners > 100) {
            return null;
        }
        
        const creatorName = sender.card || sender.nickname || String(sender.user_id);
        
        return { 
            prize: prize, 
            totalWinners: totalWinners, 
            duration: TimeConverter.parseTimeToSeconds(timeStr), 
            creator: sender.user_id, 
            creatorName: creatorName, 
            group: group 
        };
    } catch (error) { 
        logger.error(`解析抽奖指令出错: ${error}`);
        return null; 
    }
}

// ============================================
// 主事件监听 (完整修复所有指令)
// ============================================
const lotteryManager = new LotteryManager();

spark.on('message.group.normal', async (e, reply) => {
    const { raw_message, sender, group_id } = e;
    
    if (config.targetGroup && group_id != config.targetGroup) return;
    
    const normalizedMsg = MessageProcessor.normalizeMessage(raw_message);
    
    // ===== 帮助指令 =====
    if (MessageProcessor.isCommand(raw_message, 'help')) {
        const prefixExample = config.enableExclamationPrefix ? "(!可加可不加)" : "";
        reply(`${ICONS.info} 抽奖插件使用说明 ${prefixExample}\n\n${ICONS.lottery} 创建抽奖 (仅管理):\n• 抽奖 5钻石 3 1h\n• 创建抽奖 100金币 5个 30m\n\n${ICONS.lightning} 管理员功能 (仅管理):\n• 开奖 [ID] - 立即开奖\n• 删除抽奖 [ID] - 删除\n• 清除抽奖 - 清空所有抽奖\n• 抽奖配置 - 查看配置\n• 抽奖列表 - 查看所有抽奖\n• 抽奖统计 - 查看统计数据\n\n${ICONS.person} 玩家指令:\n• 参与抽奖 - 报名\n• 抽奖状态 - 查看进度\n• 我的抽奖 - 查看记录\n• 我的奖品 - 查看待领奖品\n• 领取奖品 [ID] - 领取奖品\n\n${ICONS.key} 绑定要求: 需绑定游戏ID\n${ICONS.info} 抽奖ID: 6位数字ID，如 123456`);
        return;
    }
    
    // ===== 配置查看 =====
    if (MessageProcessor.isCommand(raw_message, 'config')) {
        reply(BeautifiedReplier.beautify('config_info', config));
        return;
    }
    
    // ===== 抽奖状态 =====
    if (MessageProcessor.isCommand(raw_message, 'status')) {
        const latestLottery = lotteryManager.getLatestLottery(group_id);
        if (!latestLottery) {
            reply(BeautifiedReplier.beautify('no_active_lottery'));
            return;
        }
        
        const status = lotteryManager.getLotteryStatus(latestLottery.id);
        if (!status) {
            reply(BeautifiedReplier.beautify('no_active_lottery'));
            return;
        }
        
        reply(BeautifiedReplier.beautify('lottery_status', { 
            prize: status.prize, 
            participants: status.participants, 
            timeLeft: status.timeLeftText,
            lotteryId: status.lotteryId
        }));
        return;
    }
    
    // ===== 抽奖列表 (管理员) =====
    if (MessageProcessor.isCommand(raw_message, 'list') && canManageLottery(sender)) {
        const lotteries = lotteryManager.getAllActiveLotteries(group_id);
        if (lotteries.length === 0) {
            reply(BeautifiedReplier.beautify('info_message', { message: '当前没有活跃的抽奖' }));
            return;
        }
        
        const messages = lotteries.map(l => {
            const timeLeft = Math.ceil((l.drawAt - Date.now()) / 1000);
            return `${ICONS.lottery} ${l.prize} - 参与: ${l.participants.length}/${l.totalWinners}人 - 剩余: ${TimeConverter.formatSecondsDetailed(timeLeft)} (ID: ${l.shortId})`;
        });
        
        reply(`${ICONS.chart} 当前抽奖列表\n\n${messages.join('\n')}\n\n${ICONS.info} 使用 开奖 [抽奖ID] 立即开奖`);
        return;
    }
    
    // ===== 抽奖统计 (管理员) =====
    if (MessageProcessor.isCommand(raw_message, 'stats') && canManageLottery(sender)) {
        const stats = lotteryManager.getStatistics();
        reply(`${ICONS.chart} 抽奖统计\n\n${ICONS.lottery} 总抽奖数: ${stats.totalLotteries}\n${ICONS.fire} 进行中: ${stats.openLotteries}\n${ICONS.trophy} 已开奖: ${stats.drawnLotteries}\n${ICONS.trash} 已关闭: ${stats.closedLotteries}\n${ICONS.person} 总参与人次: ${stats.totalParticipants}\n${ICONS.star} 总中奖人次: ${stats.totalWinners}`);
        return;
    }
    
    // ===== 参与抽奖 =====
    if (MessageProcessor.isCommand(raw_message, 'join')) {
        const latestLottery = lotteryManager.getLatestLottery(group_id);
        if (!latestLottery) {
            reply(BeautifiedReplier.beautify('no_active_lottery'));
            return;
        }
        
        const result = await lotteryManager.joinLottery(latestLottery.id, sender);
        reply(result.success ? result.message : result.reason);
        return;
    }
    
    // ===== 我的抽奖 =====
    if (MessageProcessor.isCommand(raw_message, 'my')) {
        const myLotteries = [];
        for (const lottery of lotteryManager.activeLotteries.values()) {
            if (lottery.participants.some(p => p.qq == sender.user_id)) {
                myLotteries.push({
                    id: lottery.id,
                    shortId: lottery.shortId,
                    prize: lottery.prize,
                    status: lottery.status,
                    createdAt: lottery.createdAt,
                    participantsCount: lottery.participants.length,
                    isWinner: lottery.winners.some(w => w.qq == sender.user_id)
                });
            }
        }
        
        if (myLotteries.length === 0) {
            reply(BeautifiedReplier.beautify('info_message', { message: '您尚未参与任何抽奖活动' }));
            return;
        }
        
        const messages = myLotteries.map(l => {
            const statusText = l.status === 'open' ? '进行中' : (l.status === 'drawn' ? '已开奖' : '已结束');
            return `${ICONS.lottery} ${l.prize} - ${statusText} - 中奖: ${l.isWinner ? '是' : '否'} (ID: ${l.shortId})`;
        });
        
        reply(`${BeautifiedReplier.beautify('my_lotteries_title')}\n\n${messages.join('\n')}`);
        return;
    }
    
    // ===== 我的奖品 =====
    if (MessageProcessor.isCommand(raw_message, 'prize')) {
        const playerInfo = await BindingManager.getPlayerGameId(sender.user_id, sender.nickname);
        if (!playerInfo) {
            reply(BeautifiedReplier.beautify('need_binding', {}));
            return;
        }
        
        const { id: gameId } = playerInfo;
        const pendingPrizes = PrizeStorageManager.getPendingPrizes(gameId);
        if (pendingPrizes.length === 0) {
            reply(BeautifiedReplier.beautify('info_message', { message: '没有待领取的奖品' }));
            return;
        }
        
        const prizeList = pendingPrizes.map((p, i) => {
            const lottery = lotteryManager.getLotteryById(p.lotteryId);
            const lotteryId = lottery ? lottery.shortId : p.lotteryId.substring(0, 8);
            return `${i+1}. ${p.prize} (抽奖ID: ${lotteryId})`;
        }).join('\n');
        
        reply(`${BeautifiedReplier.beautify('my_prizes_title')}\n\n${prizeList}\n\n${ICONS.info} 使用 领取奖品 [抽奖ID] 领取`);
        return;
    }
    
    // ===== 领取奖品 =====
    if (MessageProcessor.startsWithCommand(raw_message, 'claim')) {
        const parts = MessageProcessor.getArguments(raw_message);
        const lotteryId = parts[0];
        
        if (!lotteryId) {
            reply(BeautifiedReplier.beautify('error_message', { message: '请指定抽奖ID' }));
            return;
        }
        
        const playerInfo = await BindingManager.getPlayerGameId(sender.user_id, sender.nickname);
        if (!playerInfo) {
            reply(BeautifiedReplier.beautify('need_binding', {}));
            return;
        }
        
        const { id: gameId } = playerInfo;
        if (!BindingManager.isPlayerOnline(gameId)) {
            reply(BeautifiedReplier.beautify('warning', `玩家 ${gameId} 不在线，请上线后再领取`));
            return;
        }
        
        const pendingPrizes = PrizeStorageManager.getPendingPrizes(gameId);
        let targetPrize = null;
        let targetPrizeIndex = -1;
        
        for (let i = 0; i < pendingPrizes.length; i++) {
            const p = pendingPrizes[i];
            const lottery = lotteryManager.getLotteryById(p.lotteryId);
            if (lottery && (lottery.id === lotteryId || lottery.shortId === lotteryId)) {
                targetPrize = p;
                targetPrizeIndex = i;
                break;
            }
        }
        
        if (!targetPrize) {
            reply(BeautifiedReplier.beautify('error_message', { message: '未找到该抽奖的待领取奖品' }));
            return;
        }
        
        const success = await PrizeDistributor.givePrizeToPlayer(gameId, targetPrize.prize);
        if (success) {
            PrizeStorageManager.removePendingPrize(gameId, targetPrizeIndex);
            reply(BeautifiedReplier.beautify('success_message', `🎉 奖品 ${targetPrize.prize} 已发放到 ${gameId}`));
        } else {
            reply(BeautifiedReplier.beautify('error_message', { message: '领取失败' }));
        }
        return;
    }
    
    // ===== 清除抽奖 (管理员) =====
    if (MessageProcessor.isCommand(raw_message, 'clear') && canManageLottery(sender)) {
        const count = lotteryManager.clearAllLotteries();
        reply(BeautifiedReplier.beautify('clear_success', { message: `已清除 ${count} 个抽奖数据` }));
        return;
    }
    
    // ===== 删除抽奖 (管理员) =====
    if (MessageProcessor.startsWithCommand(raw_message, 'delete') && canManageLottery(sender)) {
        const parts = MessageProcessor.getArguments(raw_message);
        const lotteryId = parts[0];
        
        if (!lotteryId) {
            reply(BeautifiedReplier.beautify('error_message', { message: '请指定抽奖ID' }));
            return;
        }
        
        const success = lotteryManager.deleteLottery(lotteryId);
        if (success) {
            reply(BeautifiedReplier.beautify('delete_success', { lotteryId: lotteryId }));
        } else {
            reply(BeautifiedReplier.beautify('error_message', { message: '删除失败，抽奖ID可能不存在' }));
        }
        return;
    }
    
    // ===== 立即开奖 (管理员) =====
    if (MessageProcessor.startsWithCommand(raw_message, 'open') && canManageLottery(sender)) {
        const parts = MessageProcessor.getArguments(raw_message);
        let lotteryId = parts[0];
        
        if (!lotteryId) {
            const drawable = lotteryManager.getAllActiveLotteries(group_id);
            if (drawable.length === 0) {
                reply(BeautifiedReplier.beautify('info_message', { message: '当前没有可开奖的抽奖活动' }));
                return;
            }
            lotteryId = drawable.sort((a, b) => b.createdAt - a.createdAt)[0].shortId;
        }
        
        const lottery = lotteryManager.getLotteryById(lotteryId);
        if (!lottery) {
            reply(BeautifiedReplier.beautify('error_message', { message: '未找到指定的抽奖' }));
            return;
        }
        
        const result = await lotteryManager.drawNow(lottery.id);
        if (result.success) {
            reply(BeautifiedReplier.beautify('admin_draw_now', { 
                prize: result.lottery.prize, 
                winnerCount: result.lottery.winners.length 
            }));
        } else if (result.reason !== '无人参与') {
            reply(BeautifiedReplier.beautify('error_message', { message: `强制开奖失败: ${result.reason}` }));
        }
        return;
    }
    
    // ===== 创建抽奖 (管理员) =====
    if (MessageProcessor.startsWithCommand(raw_message, 'create')) {
        // 排除其他指令
        const excludeCommands = ['抽奖配置', '抽奖状态', '抽奖列表', '抽奖帮助', '抽奖统计', '抽奖数据'];
        if (excludeCommands.some(cmd => normalizedMsg.startsWith(cmd))) return;
        
        if (!canManageLottery(sender)) {
            reply(BeautifiedReplier.beautify('error_message', { message: '权限不足' }));
            return;
        }
        
        const params = parseLotteryCommand(normalizedMsg, sender, group_id);
        if (!params) {
            reply(`${ICONS.error} 格式错误\n正确格式: 抽奖 [奖品] [名额] [时长]\n示例: 抽奖 50000金币 6 12h\n示例: 抽奖 10钻石 3 1h`);
            return;
        }
        
        const lotteryId = lotteryManager.createLottery(params);
        if (!lotteryId) {
            reply(BeautifiedReplier.beautify('error_message', { message: '创建抽奖失败，可能已达到最大活跃抽奖数' }));
            return;
        }
        
        const lottery = lotteryManager.getLotteryById(lotteryId);
        if (lottery) {
            reply(BeautifiedReplier.beautify('lottery_created', { 
                prize: lottery.prize, 
                winners: lottery.totalWinners, 
                duration: lottery.formattedDuration,
                lotteryId: lottery.shortId
            }));
        }
        return;
    }
});

// ============================================
// 玩家上线自动发放奖品
// ============================================
if (spark.onBDS && config.autoDistributeOnJoin) {
    setInterval(async () => {
        try {
            if (!spark.onBDS || !mc || !mc.getOnlinePlayers) return;
            const onlinePlayers = mc.getOnlinePlayers();
            if (!onlinePlayers || onlinePlayers.length === 0) return;
            
            for (const player of onlinePlayers) {
                const gameId = player.name?.trim();
                if (gameId) {
                    const pendingPrizes = PrizeStorageManager.getPendingPrizes(gameId);
                    if (pendingPrizes.length === 0) continue;
                    
                    let distributed = 0;
                    for (let i = pendingPrizes.length - 1; i >= 0; i--) {
                        const prize = pendingPrizes[i];
                        if (prize.expiresAt < Date.now()) {
                            PrizeStorageManager.removePendingPrize(gameId, i);
                            continue;
                        }
                        const success = await PrizeDistributor.givePrizeToPlayer(gameId, prize.prize);
                        if (success) {
                            PrizeStorageManager.removePendingPrize(gameId, i);
                            distributed++;
                        }
                    }
                    if (distributed > 0) {
                        logger.info(`玩家 ${gameId} 上线，自动发放了 ${distributed} 个存储的奖品`);
                    }
                }
            }
        } catch (error) {
            logger.error(`自动发放奖品错误: ${error}`);
        }
    }, 60000);
}

// ============================================
// 初始化
// ============================================
logger.info(' LuckyDraw 抽奖插件已加载 v1.0.0 - 所有指令可用');