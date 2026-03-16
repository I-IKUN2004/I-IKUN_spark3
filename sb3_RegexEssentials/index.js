/// <reference path="../../SparkBridgeDevelopTool/index.d.ts"/>

// ==========================================
// Author:铭记mingji  I IKUN2004
// ==========================================

const msgbuilder = require('../../handles/msgbuilder');
const _config = spark.getFileHelper('RegexEssentials');
const JSON5 = require('json5');
const axios = require('axios');
const packbuilder = require('../../handles/packbuilder');

let gmoney;
let Economy;
try {
    gmoney = require('../sb3_RegexEssentials/gmoney');
} catch (e) {
    console.warn('[IK-Core] 未找到 gmoney 模块，经济功能将不可用。');
}

const MC_PREFIX = "§7[§b星辰经济§7] §r";
const bindRemindCooldown = {};
const BIND_REMIND_INTERVAL = 1000 * 60 * 60;

let debug = false;
_config.initFile('config.json', {
    "plugin": {
        "BeginningDream": {
            "Y": 2023, "M": 1, "D": 1, "h": 0, "m": 0, "s": 0,
            "sendText": "这个梦想已持续了{years}年{months}月{days}天{hours}时{minutes}分{seconds}秒"
        },
        'QQMoney': true,
        "PayNote": "来自QQ的转账",
        "divinationsD": ["大吉", "小吉", "半吉", "吉", "末吉", "凶", "小凶", "大凶", "半凶", "末凶", "悲", "小悲", "中悲", "大悲"],
        "RegexCaseInsensitive": true
    },
    "^余额\\s?$": { "cmd": "wallet", "op": false },
    "^加钱\\s?(\\d{1,10})\\s(\\d{1,10})\\s?$": { "cmd": "add", "op": true },
    "^扣钱\\s?(\\d{1,10})\\s(\\d{1,10})\\s?$": { "cmd": "reduce", "op": true },
    "^设置钱\\s?(\\d{1,10})\\s(\\d{1,10})\\s?$": { "cmd": "set", "op": true },
    "^转账\\s?(\\d{1,10})\\s(\\d{1,10})\\s?$": { "cmd": "pay", "op": false },
    "^查信息\\s?(\\d{1,10})\\s?$": { "cmd": "query", "op": true },
    "^查绑定\\s?(.+)$": { "cmd": "queryQQ", "op": false },
    "^设置名片\\s?(\\d{1,10})\\s(.+)\\s?": { "cmd": "GroupCardSet", "op": true },
    "^占卜\\s?(.+)$": { "cmd": "divination", "op": false },
    "^菜单\\s?$": { "cmd": "trigger", "texts": "我是菜单", "op": false },
    "^版本": { "cmd": "trigger", "texts": "服务端版本 : %server_version%\n协议 : %server_protocol_version%", "op": false },
    "^wiki\\s?(.+)$": { "cmd": "wiki", "op": false },
    "^在线人数$": { "cmd": "list", "op": false },
    "^tps$": { "cmd": "tps", "op": false },
    "土豆": { "cmd": "trigger", "img": "./plugins/sparkbridge2/plugins/RegexEssentials/potato.png", "texts": "土豆服务器当前状态正常", "op": false },
    "(?:呆|带|逮|戴|待|代|袋|歹|贷|黛)jio不": { "cmd": "trigger", "texts": "阿里嘎多美羊羊桑", "img": "./plugins/sparkbridge2/plugins/RegexEssentials/daijiobu.jpg", "op": false },
    "(?:开服多久|开服几天|开服多长|这个服开几|这个服开多)": { "cmd": "bdstime", "op": false },
    "可爱捏$": { "cmd": "trigger", "img": "https://bestdori.com/assets/cn/stamp/01_rip/stamp_001007.png", "op": false },
    "(?:服主|辅助|腐竹|fuzhu|腐猪|附注|扶住|副主|扶助|腐主)": { "cmd": "trigger", "img": "./plugins/sparkbridge2/plugins/RegexEssentials/fuzhu.jpg", "op": false },
    "(?:为什么开服|为什么要开服|为啥开服|为啥要开服|开服为啥|开服是为啥|开服是为了啥|开服是为了什么|开服是因为什么)": { "cmd": "trigger", "img": "./plugins/sparkbridge2/plugins/RegexEssentials/why.jpg", "op": false },
    "(?:狗狗是怎么做到天天开心)": { "cmd": "trigger", "img": "./plugins/sparkbridge2/plugins/RegexEssentials/happy.jpg", "op": false },
    "(?:mc|启动)": { "cmd": "trigger", "img": "./plugins/sparkbridge2/plugins/RegexEssentials/start.jpg", "op": false },
    "(?:喜报|跑路)": { "cmd": "trigger", "img": "./plugins/sparkbridge2/plugins/RegexEssentials/paolu.jpg", "op": false },
    "(?:崩了)": { "cmd": "trigger", "img": "./plugins/sparkbridge2/plugins/RegexEssentials/crash.jpg", "op": false },
    "(?:我知道你很急)": { "cmd": "trigger", "img": "./plugins/sparkbridge2/plugins/RegexEssentials/ji.jpg", "op": false },
    "sb": { "cmd": "trigger", "delete_msg": true, "ban": 60, "op": false },
    "(.+)": { "cmd": "bind", "op": false },
    "^移除绑定\\s?(\\d{1,10})\\s?": { "cmd": "UNbind", "op": true },
    "^(?:绑定|绑定白名单|白名单绑定|白名单|绑)\\s?(.+)": { "cmd": "Xuidbind", "op": false },
    "^随机视频$": { "cmd": "trigger", "video": "https://api.lolimi.cn/API/xjj/xjj.php", "op": false },
    "^随机动漫头像$": { "cmd": "trigger", "img": "https://api.lolimi.cn/API/dmtx/api.php", "op": false },
    "^支付宝到账\\s?(\\d{1,10})\\s?": { "cmd": "ZFBrecord", "op": false },
    "^强制绑定\\s?(\\d{1,10})\\s(.+)": { "cmd": "ABind", "op": true },
    "^查位置\\s?(.+)?$": { "cmd": "queryPos", "op": false }
}, false);

_config.initFile('data.json', { "MoneyType": "llmoney", "MoneyName": "金币", "data": {} });
_config.initFile('bounty.json', {});

const logger = spark.getLogger();

function getGroup() {
    let g = spark.env.get("main_group");
    return g ? Number(g) : 0;
}

function getAdmins() {
    let a = spark.env.get("admin_qq");
    return Array.isArray(a) ? a : (a ? [a] : []);
}

function safeGetXbox(qq) {
    let wl_api = spark.env.get('mc'); 
    if (wl_api && typeof wl_api.getXbox === 'function') {
        let info = wl_api.getXbox(qq);
        return info ? info.xbox : null; 
    }
    return null;
}

function getXboxInfo(xboxid) {
    let wl_api = spark.env.get('mc');
    if (wl_api && typeof wl_api.getQQByXbox === 'function') {
        let qq = wl_api.getQQByXbox(xboxid);
        return qq ? qq : false;
    }
    return false;
}

let regexs = JSON5.parse(_config.getFile('config.json'));
let plugin_data = JSON5.parse(_config.getFile('data.json'));
let MoneyName = plugin_data.MoneyName;

if (gmoney) Economy = new gmoney(plugin_data.MoneyType, MoneyName);

let needUpdateConfig = false;
if (!regexs.plugin.QQMoney) {
    regexs.plugin.QQMoney = true;
    needUpdateConfig = true;
    logger.warn('[IK-Core] 配置项QQMoney缺失已自动写入配置文件');
}

const essentialRegexs = {
    "^查位置\\s?(.+)?$": { "cmd": "queryPos", "op": false },
    "^查背包\\s?(.+)$": { "cmd": "queryInv", "op": true },
    "^悬赏\\s?(.+)\\s(\\d{1,10})$": { "cmd": "addBounty", "op": false },
    "^查悬赏\\s?$": { "cmd": "listBounty", "op": false }
};

for (const [pattern, details] of Object.entries(essentialRegexs)) {
    if (!regexs[pattern]) {
        regexs[pattern] = details;
        needUpdateConfig = true;
        logger.warn(`[IK-Core] 自动补全指令: ${pattern}`);
    }
}

if (needUpdateConfig) {
    _config.updateFile("config.json", regexs);
    regexs = JSON5.parse(_config.getFile('config.json'));
}

// === SB3.0 全新原生 Web 配置面板 ===
spark.web.createConfig("RegexEssentials")
    .switch("RegexCaseInsensitive", regexs.plugin.RegexCaseInsensitive, "正则表达式是否不区分大小写")
    .text("sendText", regexs.plugin.BeginningDream.sendText, "开服天数文本可选变量{years}年{months}月{days}天{hours}时{minutes}分{seconds}秒")
    .number("Y", regexs.plugin.BeginningDream.Y || 2023, "开服天数设定——年")
    .number("M", regexs.plugin.BeginningDream.M, "开服天数设定——月")
    .number("D", regexs.plugin.BeginningDream.D, "开服天数设定——日")
    .number("h", regexs.plugin.BeginningDream.h, "开服天数设定——时")
    .number("m", regexs.plugin.BeginningDream.m, "开服天数设定——分")
    .number("s", regexs.plugin.BeginningDream.s, "开服天数设定——秒")
    .array("divinationsD", regexs.plugin.divinationsD, "占卜字库")
    .switch("QQMoney", regexs.plugin.QQMoney, "群聊经济开关")
    .text("MoneyType", plugin_data.MoneyType, "经济类型————可选llmoney/score")
    .text("PayNote", regexs.plugin.PayNote, "Q群转账备注")
    .text("MoneyName", plugin_data.MoneyName, "经济名字-若为计分板经济对应计分板名字")
    .switch("debug", debug, "调试模式")
    .register();

spark.on("config.update.RegexEssentials", (k, v) => {
    switch (k) {
        case "RegexCaseInsensitive": regexs.plugin.RegexCaseInsensitive = v; break;
        case 'divinationsD': regexs.plugin.divinationsD = v; break;
        case 'sendText': regexs.plugin.BeginningDream.sendText = v; break;
        case 'Y': regexs.plugin.BeginningDream.Y = v; break;
        case 'M': regexs.plugin.BeginningDream.M = v; break;
        case 'D': regexs.plugin.BeginningDream.D = v; break;
        case 'h': regexs.plugin.BeginningDream.h = v; break;
        case 'm': regexs.plugin.BeginningDream.m = v; break;
        case 's': regexs.plugin.BeginningDream.s = v; break;
        case 'MoneyType': plugin_data.MoneyType = v; break;
        case 'QQMoney': regexs.plugin.QQMoney = v; break;
        case 'PayNote': regexs.plugin.PayNote = v; break;
        case 'MoneyName': plugin_data.MoneyName = v; break;
        case 'debug': debug = v; break;
    }
    _config.updateFile("config.json", regexs);
    _config.updateFile("data.json", plugin_data);
    regexs = JSON5.parse(_config.getFile('config.json'));
    plugin_data = JSON5.parse(_config.getFile('data.json'));
    MoneyName = plugin_data.MoneyName;
});

spark.on('message.group.normal', (event, sendReply) => {
    const { raw_message: message, group_id: groupId, user_id: userId, message_id: messageId, sender: Sender } = event;
    if (groupId != getGroup()) return;
    
    if (debug) logger.debug(message);

    try {
        const cleanedMessage = formatMsg(message).trim();
        if (debug) logger.debug(cleanedMessage);
        
        const playerXboxId = safeGetXbox(userId);
        let playerXuid = null;
        if (playerXboxId) playerXuid = data.name2xuid(playerXboxId);
        
        if (!playerXboxId) {
            const currentName = Sender.card || Sender.nickname || "";
            if (/[\u4e00-\u9fa5]/.test(currentName)) {
                if (!cleanedMessage.startsWith("绑定") && !cleanedMessage.startsWith("bind") && 
                    !cleanedMessage.includes("addwl") && !cleanedMessage.includes("ABind")) {
                    
                    let realNameTry = resolveRealName(currentName);
                    let isTaken = getXboxInfo(realNameTry); 
                    
                    if (!isTaken) {
                        const now = Date.now();
                        const lastTime = bindRemindCooldown[userId] || 0;
                        if (now - lastTime > BIND_REMIND_INTERVAL) {
                            sendReply(`[温馨提示] 检测到您的昵称 [${currentName}] 包含中文。\n若这是您的游戏ID，请发送: 绑定 ${currentName}\n即可完成白名单绑定 (本插件已支持中文名绑定)`);
                            bindRemindCooldown[userId] = now;
                        }
                    }
                }
            }
        }

        const getSenderDisplayName = () => {
            if (!playerXuid) return "未绑定";
            let nick = getNickName(playerXuid);
            if (nick && nick !== "未命名") return stripColors(`${nick}(${playerXboxId})`); 
            return playerXboxId;
        };

        Object.entries(regexs).forEach(([regexPattern, actionDetails]) => {
            const { cmd: command, op: requiresOp, img: imagePath, texts: staticTexts, ban: ban, delete_msg: DeleteMsg, video: video, record: record } = actionDetails;
            let regex = /[a-zA-Z]/.test(regexPattern) ? new RegExp(regexPattern, regexs.plugin.RegexCaseInsensitive ? "" : "i") : new RegExp(regexPattern);

            if (regex.test(cleanedMessage)) {
                
                const admins = getAdmins();
                let isHeAdmin = admins.includes(String(userId)) || admins.includes(Number(userId));

                if (requiresOp && !isHeAdmin) {
                    sendReply('❌ 无权限执行此操作');
                    return;
                }

                switch (command) {
                    case 'trigger':   
                        if (video) sendReply(msgbuilder.video(video));
                        if (record) sendReply(msgbuilder.record(record));
                        if (imagePath) sendReply(msgbuilder.img(imagePath));
                        if (staticTexts) sendReply(replacePlaceholders(staticTexts));
                        
                        if (ban && ban != -1 && !isHeAdmin) spark.QClient.sendWSPack(packbuilder.GroupBanPack(groupId, userId, ban));
                        if (DeleteMsg && DeleteMsg == true && !isHeAdmin) spark.QClient.sendWSPack(packbuilder.DeleteMsgPack(messageId));
                        break;
                         
                    case 'bind':   
                        if (playerXboxId && getXboxInfo(playerXboxId) && !isHeAdmin) {
                            let targetName = playerXboxId; 
                            if (playerXuid) {
                                let nick = getNickName(playerXuid);
                                if (nick && nick !== "未命名") targetName = nick; 
                            }
                            let cleanName = stripColors(targetName);
                            if (!Sender.card.includes(cleanName) && Sender.card != cleanName) {
                                spark.QClient.sendWSPack(packbuilder.GroupCardSet(groupId, userId, cleanName));
                                sendReply(`⚠️ 群昵称未包含 ${cleanName}，已自动修改`);
                            }
                        }
                        break;

                    case 'ABind': {   
                        let OPbind = regex.exec(cleanedMessage);
                        let targetQQ = OPbind[1];
                        let inputName = OPbind[2].trim();
                        let realName = resolveRealName(inputName);
                        let RecipientName = safeGetXbox(targetQQ);
                        
                        if (!RecipientName) {
                            let BindQQ = getXboxInfo(realName);
                            if (BindQQ != false) {
                                sendReply(`❌ "${realName}" 已经被 ${BindQQ} 绑定`);
                                return;
                            }
                            let wl_api = spark.env.get('mc');
                            if (wl_api) wl_api.addXbox(targetQQ, realName);
                            
                            let display = stripColors(inputName === realName ? realName : `${inputName}(${realName})`);
                            sendReply(`✅ 已为 ${targetQQ} 成功绑定: ${display}`);
                            
                            mc.runcmd('whitelist add "' + realName + '"');
                            spark.QClient.sendWSPack(packbuilder.GroupCardSet(groupId, targetQQ, realName));
                        } else {
                            sendReply("⚠️ 对方已绑定为:" + RecipientName);
                        }
                        break;
                    }

                    case 'Xuidbind': {  
                        let Xuidbind = regex.exec(cleanedMessage);
                        let inputSelfName = Xuidbind[1].trim();
                        if (inputSelfName == '') return sendReply(`❌ 请勿绑定虚空玩家名`);
                        
                        let realSelfName = resolveRealName(inputSelfName);
                        let XuidrecipientNameQQ = getXboxInfo(realSelfName);
                        let MyBoundName = safeGetXbox(userId);
                        
                        if (XuidrecipientNameQQ != false) {
                            if (XuidrecipientNameQQ == userId) return sendReply(`✅ 已成功绑定:${realSelfName}\n无需重复绑定`);
                            return sendReply(`❌ "${realSelfName}" 已经被 ${XuidrecipientNameQQ} 绑定`);
                        }
                        
                        if (!MyBoundName) {
                            let wl_api = spark.env.get('mc');
                            if (wl_api) wl_api.addXbox(userId, realSelfName);
                            
                            let display = stripColors(inputSelfName === realSelfName ? realSelfName : `${inputSelfName}(${realSelfName})`);
                            sendReply(`✅ 成功绑定: ${display}`);
                            
                            mc.runcmd('whitelist add "' + realSelfName + '"');
                            if (!isHeAdmin) spark.QClient.sendWSPack(packbuilder.GroupCardSet(groupId, userId, realSelfName));
                            return;
                        } else {
                            sendReply(`⚠️ 你已绑定:${MyBoundName}\n请勿重复绑定`);
                        }
                        break;
                    }

                    case 'add':   
                    case 'reduce': 
                    case 'set':    
                    case 'pay':    
                    case 'wallet': 
                        if (!Economy) return sendReply("❌ 经济组件加载失败，无法使用此功能");
                        handleEconomy(command, regex, cleanedMessage, sendReply, playerXboxId, playerXuid, plugin_data, getSenderDisplayName);
                        break;

                    case 'bdstime':   
                        const msgTemp = regexs.plugin.BeginningDream.sendText;
                        const dreamDate = new Date(
                            regexs.plugin.BeginningDream.Y, regexs.plugin.BeginningDream.M - 1, regexs.plugin.BeginningDream.D,
                            regexs.plugin.BeginningDream.h, regexs.plugin.BeginningDream.m, regexs.plugin.BeginningDream.s
                        );
                        let diff = calculateDiff(dreamDate);
                        let msgR = msgTemp.replace("{years}", diff.years).replace("{months}", diff.months).replace("{days}", diff.days)
                            .replace("{hours}", diff.hours).replace("{minutes}", diff.minutes).replace("{seconds}", diff.seconds);
                        sendReply(`⏳ ${msgR}`);
                        break;

                    case 'list':   
                        let List_RealPlayers = [];
                        let List_SimulatedPlayers = [];
                        mc.getOnlinePlayers().forEach((player) => {
                            if (player.isSimulatedPlayer()) {
                                List_SimulatedPlayers.push(player.name);
                            } else {
                                let nick = getNickName(player.xuid);
                                if (nick && nick !== "未命名") List_RealPlayers.push(stripColors(`${nick}(${player.realName})`));
                                else List_RealPlayers.push(player.realName);
                            }
                        });
                        sendReply(`🟢 当前在线玩家: ${List_RealPlayers.length}\n${List_RealPlayers.join(", ")}`);
                        if (List_SimulatedPlayers.length > 0) sendReply(`🤖 当前在线假人: ${List_SimulatedPlayers.length}\n${List_SimulatedPlayers.join(", ")}`);
                        break;

                    case 'tps':   
                        let ver = mc.getBDSVersion();
                        let protocol = mc.getServerProtocolVersion();
                        let players = mc.getOnlinePlayers();
                        let totalPing = 0, validPingCount = 0;
                        players.forEach(pl => {
                            let dev = pl.getDevice();
                            if (dev && dev.avgPing != null) { totalPing += dev.avgPing; validPingCount++; }
                        });
                        let avgPing = validPingCount > 0 ? (totalPing / validPingCount).toFixed(0) : 0;
                        sendReply(`📊 服务器状态 (Lite)\n⚡ 版本: ${ver} (协议${protocol})\n👥 在线: ${players.length} 人\n📶 平均延迟: ${avgPing}ms`);
                        break;

                    case 'query': {   
                        let results = regex.exec(cleanedMessage);
                        let targetQQ = results[1];
                        let targetName = safeGetXbox(targetQQ);
                        
                        if (!targetName) return sendReply("❌ 对方无绑定数据");
                        
                        let queryXuid = data.name2xuid(targetName);
                        let queryMoney = Economy ? Economy.get(queryXuid) : "组件缺失";
                        let qqmoney_switch = plugin_data.data[targetName] === true ? "✅ 开启" : (plugin_data.data[targetName] === false ? "❌ 关闭" : "未初始化");
                        
                        let nick = getNickName(queryXuid);
                        let display = stripColors((nick && nick !== "未命名") ? `${nick}(${targetName})` : targetName);
                        sendReply(`🔍 查询结果\nQQ：${targetQQ}\n绑定ID：${display}\n💰 余额：${queryMoney}\n⚙️ 状态：${qqmoney_switch}`);
                        break;
                    }
                    
                    case 'queryPos':   
                    case 'queryInv':
                    case 'addBounty':
                    case 'listBounty':
                    case 'divination': 
                    case 'queryQQ':
                    case 'wiki':
                    case 'GroupCardSet':
                    case 'UNbind':
                    case 'ChatGPT':
                    case 'ZFBrecord':
                        handleMisc(command, regex, cleanedMessage, sendReply, event, regexs, playerXboxId, playerXuid, getSenderDisplayName);
                        break;

                    default:
                        sendReply("⚠️ 未知命令，请检查配置");
                        break;
                }
            }
        });
    } catch (error) {
        logger.error(`处理消息时出错: ${error.message}`);
        logger.error(error.stack);
    }
});

mc.listen('onJoin', (pl) => {
    if (regexs.plugin.QQMoney == true) {
        if (pl.isSimulatedPlayer()) return;
        let hasInitialized = true;
        if (plugin_data.data[pl.realName] == undefined) {
            plugin_data.data[pl.realName] = false;
            _config.updateFile('data.json', plugin_data);
            hasInitialized = false;
        }
        setTimeout(() => {
            let player = mc.getPlayer(pl.xuid);
            if (player) {
                if (!hasInitialized) {
                    player.tell(`${MC_PREFIX}§e本服支持群聊经济，输入 §a/qqmoney §e开启/关闭，§b群里输入 "绑定 你的ID"`);
                } else {
                    const status = plugin_data.data[player.realName] ? "§a已开启" : "§c已关闭";
                    player.tell(`${MC_PREFIX}§7群聊经济功能: ${status} §7(输入 §d/qqmoney §7切换)`);
                }
            }
        }, 3000);
    }
});

mc.listen("onServerStarted", () => {
    if (regexs.plugin.QQMoney == true) {
        const qqmoney_cmd = mc.newCommand(`qqmoney`, `§dSparkBridge3§e开启/关闭QQ群经济功能`, PermType.Any);
        qqmoney_cmd.setAlias(`qm`);
        qqmoney_cmd.overload();
        qqmoney_cmd.setCallback((_cmd, origin, output, _result) => {
            let pl = origin.player;
            if (origin.type == 0) {
                if (!pl.isSimulatedPlayer()) {
                    if (plugin_data.data[pl.realName] == true) {
                        plugin_data.data[pl.realName] = false;
                        pl.tell(`${MC_PREFIX}§c群聊经济已关闭`);
                    } else {
                        plugin_data.data[pl.realName] = true;
                        pl.tell(`${MC_PREFIX}§a群聊经济已开启`);
                    }
                    _config.updateFile('data.json', plugin_data);
                } else {
                    output.error(`此命令不支持模拟玩家执行!`);
                }
            } else {
                regexs = JSON5.parse(_config.getFile('config.json'));
                plugin_data = JSON5.parse(_config.getFile('data.json'));
                output.success(`配置文件已重载!`);
            }
        });
        qqmoney_cmd.setup();
    }
});

mc.listen("onPlayerDie", (player, source) => {
    if (!player || !source || !source.isPlayer()) return;
    let killer = source.toPlayer();
    if (!killer) return;
    if (player.xuid === killer.xuid) return;
    
    let bountyData = JSON5.parse(_config.getFile('bounty.json') || "{}");
    if (!bountyData[player.xuid]) return;
    
    let bountyInfo = bountyData[player.xuid];
    if (bountyInfo.total <= 0) return;
    
    let reward = bountyInfo.total;
    let kNick = getNickName(killer.xuid);
    let killerDisplay = (kNick && kNick !== "未命名") ? kNick : killer.realName;
    let killerNick = stripColors(killerDisplay);
    
    let dNick = getNickName(player.xuid);
    let deadDisplay = (dNick && dNick !== "未命名") ? dNick : player.realName;
    let deadNick = stripColors(deadDisplay);
    
    Economy.add(killer.xuid, reward);
    delete bountyData[player.xuid];
    _config.updateFile('bounty.json', bountyData);
    
    let weaponItem = killer.getHand();
    let weaponStr = (weaponItem && !weaponItem.isNull()) ? weaponItem.name : "空手/拳头";
    if (weaponItem && weaponItem.isEnchanted) weaponStr = `[附魔] ` + weaponStr;
    
    let pos = player.pos;
    let dimStr = pos.dim === "主世界" || pos.dim === "Overworld" ? "主世界" : (pos.dim === "下界" || pos.dim === "Nether" ? "下界" : "末地");
    let locStr = `${dimStr} (X:${pos.x.toFixed(0)}, Y:${pos.y.toFixed(0)}, Z:${pos.z.toFixed(0)})`;

    mc.broadcast(`\n§6§l╔════════════════╗\n§l§e   🩸 悬赏终结 🩸\n§6§l╠════════════════╣\n§f 猎人：§a${killerNick}\n§f 使用：§c${weaponStr}\n§f 制裁了：§7${deadNick}\n§f 夺得：§g${reward} 金币\n§6§l╚════════════════╝\n`);
    mc.runcmdEx('playsound random.levelup @a ~ ~ ~ 1 1');

    let groupMsg = `🩸 【猎杀战报】悬赏已终结！\n━━━━━━━━━━━━━━\n🗡️ 猎人：${killerNick}\n💀 死者：${deadNick} (已被制裁)\n🔪 凶器：${weaponStr}\n📍 地点：${locStr}\n💰 提现：${reward} ${MoneyName} (已打入猎人账户)\n━━━━━━━━━━━━━━\n⚖️ 正义也许会迟到，但赏金永远不会！`;
    spark.QClient.sendGroupMsg(getGroup(), groupMsg);
});

function stripColors(str) {
    if (typeof str !== 'string') return str;
    return str.replace(/§[0-9a-fk-or]/ig, "");
}

function resolveRealName(inputName) {
    try {
        let path = "plugins/GwNickName/data.json";
        if (File.exists(path)) {
            let content = File.readFrom(path);
            if (content) {
                let json = JSON.parse(content);
                let dataMap = json.data || {};
                for (let xuid in dataMap) {
                    if (dataMap[xuid] == inputName) {
                        let real = data.xuid2name(xuid);
                        if (real) return real;
                    }
                }
            }
        }
    } catch (e) {}
    return inputName;
}

function resolveTarget(input) {
    if (/^\d+$/.test(input)) {
        let boundName = safeGetXbox(input);
        if (boundName) {
            let xuid = data.name2xuid(boundName);
            if (xuid) return { xuid, realName: boundName };
        }
    }
    let realName = resolveRealName(input);
    let xuid = data.name2xuid(realName);
    if (xuid) return { xuid, realName };
    xuid = data.name2xuid(input);
    if (xuid) return { xuid, realName: input };
    return null;
}

function getNickName(xuid) {
    if (ll.hasExported("nickname", "getName")) {
        return ll.import("nickname", "getName")(xuid);
    }
    return null;
}

function replacePlaceholders(str) {
    if (!str) return "";
    return str.replace(/%server_version%/g, mc.getBDSVersion())
              .replace(/%server_protocol_version%/g, mc.getServerProtocolVersion())
              .replace(/%online%/g, mc.getOnlinePlayers().length);
}

function handleEconomy(cmd, regex, msg, reply, xboxId, xuid, pData, getSenderDisplay) {
    let details = regex.exec(msg);
    let senderDisplay = stripColors(getSenderDisplay()); 
    
    if (cmd === 'wallet') {
        if (!xboxId) { reply(`⚠️ 你并未绑定白名单!`, true); return; }
        if (!xuid) { reply(`❌ 无法获取XUID (请进入服务器刷新数据)`); return; }
        let money = Economy.get(xuid);
        let status = pData.data[xboxId] === true ? "✅ 开启" : (pData.data[xboxId] === false ? "❌ 关闭" : "未初始化");
        reply(`👛 <${senderDisplay}> 资产: ${money} ${MoneyName}\n⚙️ 状态: ${status}`);
        return;
    }

    if (cmd === 'pay') {
        if (!xboxId) { reply(`⚠️ 你并未绑定白名单!`, true); return; }
        if (!xuid) { reply(`❌ 无法获取XUID (请进入服务器刷新数据)`); return; }
        if (pData.data[xboxId] != true) { reply("❌ 你未开启群聊经济"); return; }
        
        let inputTarget = details[1];
        let targetObj = resolveTarget(inputTarget);
        if (!targetObj) { reply(`❌ 找不到目标: ${inputTarget} (未绑定或不存在)`); return; }
        
        let targetName = targetObj.realName;
        let targetXuid = targetObj.xuid;
        if (pData.data[targetName] != true) { reply("❌ 对方未开启群聊经济"); return; }

        let amount = Number(details[2]);
        let myMoney = Economy.get(xuid);
        if (amount <= 0 || myMoney < amount) { reply("❌ 金额无效或余额不足"); return; }
        if (xuid == targetXuid) { reply("⚠️ 不能转给自己"); return; }
        
        if (Economy.trans(xuid, targetXuid, amount, regexs.plugin.PayNote)) {
            let tNick = getNickName(targetXuid);
            let targetDisplay = stripColors((tNick && tNick !== "未命名") ? `${tNick}(${targetName})` : targetName);
            let myNewBal = Economy.get(xuid);
            let targetNewBal = Economy.get(targetXuid);

            reply(`💸 转账成功\n━━━━━━━━━━━━\n📤 付款: ${senderDisplay}\n💰 余额: ${myNewBal} 💰\n📥 收款: ${targetDisplay}\n💰 余额: ${targetNewBal} 💰\n━━━━━━━━━━━━\n💸 金额: ${amount} ${MoneyName}\n━━━━━━━━━━━━`);
            let gameMsg = `${MC_PREFIX}§a[转账]§f 成功\n§7━━━━━━━━━━━━\n§b付款: §e${senderDisplay}\n§7余额: §a${myNewBal} ${MoneyName}\n§b收款: §e${targetDisplay}\n§7余额: §a${targetNewBal} ${MoneyName}\n§7━━━━━━━━━━━━\n§b金额: §a${amount} ${MoneyName}\n`;
            let targetPl = mc.getPlayer(targetXuid);
            if (targetPl) targetPl.tell(gameMsg);
        } else {
            reply("❌ 转账失败");
        }
        return;
    }

    let inputTarget = details[1];
    let targetObj = resolveTarget(inputTarget);
    if (!targetObj) { reply(`❌ 找不到目标: ${inputTarget}`); return; }
    
    let targetName = targetObj.realName;
    let targetXuid = targetObj.xuid;
    let tNick = getNickName(targetXuid);
    let targetDisplay = stripColors((tNick && tNick !== "未命名") ? `${tNick}(${targetName})` : targetName);
    let val = Number(details[2]);

    if (cmd === 'add') {
        Economy.add(targetXuid, val);
        reply(`💰 对 ${targetDisplay} 增加 ${val}${MoneyName}\n当前余额: ${Economy.get(targetXuid)}${MoneyName}`);
    } else if (cmd === 'reduce') {
        Economy.reduce(targetXuid, val);
        reply(`💸 对 ${targetDisplay} 扣除 ${val}${MoneyName}\n当前余额: ${Economy.get(targetXuid)}${MoneyName}`);
    } else if (cmd === 'set') {
        Economy.set(targetXuid, val);
        reply(`✅ 对 ${targetDisplay} 设置为 ${val}${MoneyName}\n当前余额: ${Economy.get(targetXuid)}${MoneyName}`);
    }
}

function handleMisc(cmd, regex, msg, reply, event, regexs, playerXboxId, playerXuid, getSenderDisplay) {
    if (cmd === 'queryPos') {
        let match = regex.exec(msg);
        let targetInput = match[1] ? match[1].trim() : null;
        let targetXuid = null;
        let targetRealName = null;

        if (!targetInput) {
            let myXbox = safeGetXbox(event.user_id);
            if (!myXbox) { reply("⚠️ 你未绑定白名单，请指定查询目标或先在群里发送“绑定”！"); return; }
            targetXuid = data.name2xuid(myXbox);
            targetRealName = myXbox;
        } else {
            let targetObj = resolveTarget(targetInput);
            if (!targetObj) { reply(`❌ 找不到目标: "${targetInput}"`); return; }
            targetXuid = targetObj.xuid;
            targetRealName = targetObj.realName;
        }

        let nick = getNickName(targetXuid);
        let display = stripColors((nick && nick !== "未命名") ? `${nick}(${targetRealName})` : targetRealName);

        let targetPlayer = mc.getPlayer(targetXuid);
        if (!targetPlayer) { reply(`😴 玩家 [${display}] 当前不在线。`); return; }

        let pos = targetPlayer.pos;
        let dimName = pos.dim;      
        let dimZh = dimName === "主世界" || dimName === "Overworld" ? "🟢 主世界" : (dimName === "下界" || dimName === "Nether" ? "🔴 下界" : "🟣 末地");

        let x = pos.x.toFixed(1), y = pos.y.toFixed(1), z = pos.z.toFixed(1);
        let hp = targetPlayer.health, maxHp = targetPlayer.maxHealth;
        let hpIcon = hp <= (maxHp / 3) ? "💔" : "❤️";
        let handItem = targetPlayer.getHand();
        let handStr = (handItem && !handItem.isNull()) ? handItem.name : "空手";
        let status = "在线 🟢";
        
        try {
            let dev = targetPlayer.getDevice();
            if (dev) status = `在线 🟢 (${dev.os || "未知系统"} | 延迟:${dev.avgPing != null ? dev.avgPing + "ms" : "未知"})`;
        } catch (e) {}

        reply(`📍 卫星定位成功！\n━━━━━━━━━━━━\n👤 玩家: ${display}\n🗺️ 维度: ${dimZh}\n🧭 坐标: X:${x}, Y:${y}, Z:${z}\n${hpIcon} 血量: ${hp} / ${maxHp}\n🖐️ 手持: ${handStr}\n📡 状态: ${status}\n━━━━━━━━━━━━`);
        return;
    }
    
    else if (cmd === 'queryInv') {
        let targetInput = regex.exec(msg)[1].trim();
        let targetObj = resolveTarget(targetInput);
        if (!targetObj) { reply(`❌ 找不到目标: "${targetInput}"`); return; }

        let targetPlayer = mc.getPlayer(targetObj.xuid);
        if (!targetPlayer) { reply(`😴 玩家 [${targetObj.realName}] 不在线，无法查背包。`); return; }

        let nick = getNickName(targetObj.xuid);
        let display = stripColors((nick && nick !== "未命名") ? `${nick}(${targetObj.realName})` : targetObj.realName);
        let itemsMap = {}; let totalValuableCount = 0;
        const junkList = ["minecraft:dirt", "minecraft:cobblestone", "minecraft:stone", "minecraft:gravel", "minecraft:netherrack", "minecraft:sand", "minecraft:rotten_flesh", "minecraft:bone"];

        const scanContainer = (container, tag) => {
            if (!container) return;
            for (let i = 0; i < container.size; i++) {
                let it = container.getItem(i);
                if (!it || it.isNull() || junkList.includes(it.type)) continue;
                let itemName = tag ? `${it.name} [${tag}]` : it.name;
                if (!itemsMap[itemName]) itemsMap[itemName] = { count: 0, enchanted: false };
                itemsMap[itemName].count += it.count;
                if (it.isEnchanted) itemsMap[itemName].enchanted = true;
                totalValuableCount++;
            }
        };

        scanContainer(targetPlayer.getInventory(), "");
        scanContainer(targetPlayer.getEnderChest(), "末影箱");
        scanContainer(targetPlayer.getArmor(), "身上");
        
        let offHand = targetPlayer.getOffHand();
        if (offHand && !offHand.isNull() && !junkList.includes(offHand.type)) {
            let n = `${offHand.name} [副手]`;
            if (!itemsMap[n]) itemsMap[n] = { count: 0, enchanted: offHand.isEnchanted };
            itemsMap[n].count += offHand.count;
            totalValuableCount++;
        }

        if (totalValuableCount === 0) { reply(`🎒 [${display}] 的背包和末影箱比脸还干净。`); return; }
        let itemsArray = [];
        for (let name in itemsMap) itemsArray.push({ name: name, count: itemsMap[name].count, enchanted: itemsMap[name].enchanted });
        itemsArray.sort((a, b) => b.count - a.count);

        let replyMsg = `🎒 正在查水表: ${display}\n━━━━━━━━━━━━\n`;
        let displayLimit = 20; 
        for (let i = 0; i < Math.min(itemsArray.length, displayLimit); i++) {
            let it = itemsArray[i];
            replyMsg += `${it.enchanted ? "✨" : "🔸"} ${it.name}  x${it.count}\n`;
        }
        if (itemsArray.length > displayLimit) replyMsg += `...及其他 ${itemsArray.length - displayLimit} 种物品\n`;
        replyMsg += `━━━━━━━━━━━━\n💡 已自动过滤泥土/石头等垃圾。`;
        reply(replyMsg);
        return;
    }
    
    else if (cmd === 'addBounty') {
        if (!Economy) { reply("❌ 经济组件未加载"); return; }
        let match = regex.exec(msg);
        let targetInput = match[1].trim();
        let amount = Number(match[2]);

        if (amount < 10000) { reply("❌ 穷鬼别来，悬赏金额最低 10000 起步！"); return; }
        if (!playerXuid) { reply("⚠️ 必须绑定白名单才能发布悬赏！"); return; }
        
        let targetObj = resolveTarget(targetInput);
        if (!targetObj) { reply(`❌ 找不到目标: "${targetInput}"`); return; }
        if (targetObj.xuid === playerXuid) { reply("❌ 不能悬赏你自己！"); return; }

        let myMoney = Economy.get(playerXuid);
        if (myMoney < amount) { reply(`❌ 余额不足！你只有 ${myMoney} ${MoneyName}。`); return; }

        let reduceSuccess = Economy.reduce(playerXuid, amount);
        if (!reduceSuccess) { reply("❌ 系统异常，扣款失败，悬赏未能发布！"); return; }

        let bountyData = JSON5.parse(_config.getFile('bounty.json') || "{}");
        if (!bountyData[targetObj.xuid]) bountyData[targetObj.xuid] = { name: targetObj.realName, total: 0 };
        
        bountyData[targetObj.xuid].total += amount;
        _config.updateFile('bounty.json', bountyData);

        let senderDisplay = stripColors(getSenderDisplay());
        let tNick = getNickName(targetObj.xuid);
        let targetDisplay = stripColors((tNick && tNick !== "未命名") ? `${tNick}(${targetObj.realName})` : targetObj.realName);

        reply(`📜 【地下悬赏令】已张贴！\n━━━━━━━━━━━━━\n🎯 猎物：[${targetDisplay}]\n💰 赏金：${bountyData[targetObj.xuid].total} ${MoneyName}\n👤 雇主：[${senderDisplay}]\n━━━━━━━━━━━━━\n🎙️ 雇主留言："谁能提着他的头来见我，这笔钱就是谁的！"\n⚔️ (此悬赏全服有效，击杀目标后赏金系统自动秒结)`);
        mc.broadcast(`\n§4§l╔════════════════╗\n§l§c  📜 全服通缉令\n§4§l╠════════════════╣\n§f 恶徒：\n  §c${targetDisplay}\n§f 的项上人头被买下了！\n§f 赏金：§g${bountyData[targetObj.xuid].total} 金币\n§f 猎人们，擦亮刀剑吧！\n§4§l╚════════════════╝\n`);
        mc.runcmdEx('playsound random.anvil_use @a ~ ~ ~ 1 0.8');
        return;
    }
    
    else if (cmd === 'listBounty') {
        let bountyData = JSON5.parse(_config.getFile('bounty.json') || "{}");
        let list = Object.entries(bountyData).sort((a, b) => b[1].total - a[1].total);
        if (list.length === 0) { reply("☮️ 当前服务器和平无事，没有人在通缉榜上。"); return; }

        let replyMsg = `📜 【猎杀悬赏榜】\n━━━━━━━━━━━━\n`;
        list.slice(0, 10).forEach((item, index) => {
            let xuid = item[0], info = item[1], tNick = getNickName(xuid);
            let display = stripColors((tNick && tNick !== "未命名") ? `${tNick}(${info.name})` : info.name);
            replyMsg += `[${index+1}] 💀 ${display} - 赏金: ${info.total}\n`;
        });
        replyMsg += `━━━━━━━━━━━━\n🗡️ 进服猎杀他们领取赏金吧！`;
        reply(replyMsg);
        return;
    }

    if (cmd === 'divination') {
        let list = regexs.plugin.divinationsD;
        let content = event.raw_message.substr(2).trim();
        let tm = system.getTimeObj();
        reply(`🔮 占卜结果\n📅 ${tm.Y}/${tm.M}/${tm.D}\n👤 ${event.sender.nickname}\n💭 【${content}】\n✨ 【${list[Math.floor(Math.random() * list.length)]}】`);
    }
    else if (cmd === 'wiki') {
        let term = regex.exec(msg)[1];
        reply(`📚 MC Wiki: https://zh.minecraft.wiki/w/${encodeURIComponent(term)}`);
    }
    else if (cmd === 'ChatGPT') {
        let text = regex.exec(msg)[1];
        axios.get(`https://api.lolimi.cn/API/AI/gpt4o.php?sx=&msg=${encodeURIComponent(text)}`)
            .then(res => reply(res.data)).catch(() => reply('❌ API 请求失败'));
    }
    else if (cmd === 'queryQQ') {
        let name = regex.exec(msg)[1].trim();
        let realName = resolveRealName(name);
        let qq = getXboxInfo(realName);
        let display = stripColors(name === realName ? name : `${name}(${realName})`);
        reply(qq ? `🔍 ID: "${display}"\nQQ: ${qq}` : `ℹ️ "${name}" 未绑定`);
    }
    else if (cmd === 'UNbind') {
        let qq = regex.exec(msg)[1];
        let xuid = safeGetXbox(qq);
        if (xuid) {
            let wl_api = spark.env.get('mc');
            if (wl_api) wl_api.remXboxByQid(qq);
            reply(`✅ 解绑成功`);
            mc.runcmd('whitelist remove "' + xuid + '"');
        } else {
            reply(`❌ 解绑失败，该QQ未绑定`);
        }
    }
    else if (cmd === 'GroupCardSet') {
        let res = regex.exec(msg);
        spark.QClient.sendWSPack(packbuilder.GroupCardSet(getGroup(), res[1], res[2]));
        reply(`✅ 名片已修改`);
    }
    else if (cmd === 'ZFBrecord') {
        let n = regex.exec(msg)[1];
        reply(msgbuilder.record(`https://api.milorapart.top/test/ai/zfb.php?amount=${n}`));
    }
}

function formatMsg(msg) {
    const regex = /\[CQ:(image|face|mface|at|record|video|share|music|redbag|poke|node|forward|xml|json|cardimage)(.+?)\]/g;
    return msg.replace(regex, (match, p1, p2) => {
        const map = { 'at': extractQQNumber(p2), 'image': '[图片]', 'record': '[语音]', 'video': '[视频]' };
        return map[p1] || match;
    });
}

function extractQQNumber(data) {
    const parts = data.split(',');
    for (let part of parts) { if (part.startsWith('qq=')) return part.split('=')[1]; }
    return data;
}

function calculateDiff(targetDate) {
    let now = new Date(); let d2 = new Date(targetDate);
    if (d2 < now) { let temp = d2; d2 = now; now = temp; }
    let diff = d2 - now;
    let seconds = Math.floor(diff / 1000); let minutes = Math.floor(seconds / 60); let hours = Math.floor(minutes / 60);
    let days = Math.floor(hours / 24); let months = Math.floor(days / 30); let years = Math.floor(days / 365);
    return { years, months: months % 12, days: days % 30, hours: hours % 24, minutes: minutes % 60, seconds: seconds % 60 };
}

function getPlayerBounty(xuid) {
    try {
        let bountyData = JSON5.parse(_config.getFile('bounty.json') || "{}");
        if (bountyData[xuid] && bountyData[xuid].total > 0) return bountyData[xuid].total;
    } catch (e) {}
    return 0;
}

ll.exports(getPlayerBounty, "RegexEssentials", "getBounty");