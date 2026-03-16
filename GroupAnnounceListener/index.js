/**
 * GroupAnnounceListener - 群公告监听插件
 * 版本: 1.0.0
 * 作者: IKUN2004
 * 功能: 监听QQ群公告，支持关键词和@全体成员检测，可转发到MC服务器
 */

const configFile = spark.getFileHelper('GroupAnnounceListener');
const logger = spark.getLogger('GroupAnnounceListener');

// 默认配置
const defaultConfig = {
    targetGroup: 0,                // 需要用户手动设置的群号
    adminOnly: true,               // 只监听管理员/群主
    dataFileName: 'announcement.json',
    enableMCForward: false,        // MC转发开关（默认关闭）
    replyConfirm: true,            // 是否回复确认消息
    showHelpWhenAtBot: true,       // 是否在@机器人时显示帮助
    keywords: ['公告'],            // 关键词列表
    lastProcessedMsgId: 0
};

configFile.initFile('config.json', defaultConfig);
const config = JSON.parse(configFile.getFile('config.json'));

// 初始化数据文件
configFile.initFile(config.dataFileName, {
    lastAnnouncement: null,
    lastUpdateTime: 0,
    groupId: config.targetGroup
});

// 消息处理跟踪
const processedMessages = new Set();

/**
 * 检查是否包含@全体成员
 */
function hasAtAll(e) {
    if (!e) return false;
    
    // 方法1：检查整个消息对象字符串
    const msgStr = JSON.stringify(e);
    if (msgStr.includes('全体成员') || msgStr.includes('CQ:at,qq=all')) {
        return true;
    }
    
    // 方法2：检查raw_message
    if (e.raw_message) {
        const atAllPatterns = [
            '@全体成员',
            '@所有人',
            '[CQ:at,qq=all]',
            '[CQ:at,qq=everyone]'
        ];
        
        for (const pattern of atAllPatterns) {
            if (e.raw_message.includes(pattern)) return true;
        }
    }
    
    return false;
}

/**
 * 检查是否包含关键词
 */
function hasKeywords(e) {
    if (!config.keywords || config.keywords.length === 0) {
        return false;
    }
    
    // 提取消息内容
    let content = '';
    
    // 从message段提取
    if (e.message && Array.isArray(e.message)) {
        for (const segment of e.message) {
            if (segment.type === 'text' && segment.data && segment.data.text) {
                content += segment.data.text;
            }
        }
    }
    
    // 如果没有提取到，使用raw_message
    if (!content && e.raw_message) {
        content = e.raw_message;
    }
    
    // 移除CQ码
    content = content.replace(/\[CQ:[^\]]*\]/g, '');
    
    // 检查每个关键词
    for (const keyword of config.keywords) {
        if (keyword && content.includes(keyword)) {
            return true;
        }
    }
    
    return false;
}

/**
 * 判断是否为公告消息
 */
function isAnnouncementMessage(e) {
    if (!e || !e.group_id || !e.sender) {
        return false;
    }
    
    // 1. 检查目标群
    if (config.targetGroup && e.group_id != config.targetGroup) {
        return false;
    }
    
    // 2. 检查管理员权限
    if (config.adminOnly) {
        if (!(e.sender.role === 'owner' || e.sender.role === 'admin')) {
            return false;
        }
    }
    
    // 3. 检查内容长度（避免太短的消息）
    const content = extractCleanText(e);
    if (content.length < 3) {
        return false;
    }
    
    // 4. 核心逻辑：关键词 OR @全体成员
    const isAtAll = hasAtAll(e);
    const hasKeyword = hasKeywords(e);
    
    // 只要满足任一条件就是公告
    return isAtAll || hasKeyword;
}

/**
 * 提取纯文本内容 - 保留换行
 */
function extractCleanText(e) {
    let text = '';
    
    // 优先从raw_message提取，因为它保留了换行
    if (e.raw_message) {
        text = e.raw_message;
    }
    // 如果没有raw_message，从message段提取
    else if (e.message && Array.isArray(e.message)) {
        for (const segment of e.message) {
            if (segment.type === 'text' && segment.data && segment.data.text) {
                text += segment.data.text;
            }
        }
    }
    
    // 移除CQ码，保留换行符
    text = text.replace(/\[CQ:[^\]]*\]/g, '');
    
    // 统一换行符
    text = text.replace(/\r\n/g, '\n')
               .replace(/\r/g, '\n');
    
    return text.trim();
}

/**
 * 转发到MC服务器 - 美化格式
 */
function forwardToMC(content, senderName) {
    try {
        if (!config.enableMCForward) {
            return false;
        }
        
        if (!spark.onBDS) {
            return false;
        }
        
        if (typeof mc === 'undefined' || typeof mc.broadcast !== 'function') {
            return false;
        }
        
        // 只清理CQ码，保留所有换行
        let mcContent = content
            .replace(/\[CQ:[^\]]*\]/g, '')
            .replace(/\r\n/g, '\n')
            .replace(/\r/g, '\n');
        
        // 按换行分割
        const lines = mcContent.split('\n');
        
        // 为每行添加颜色
        const coloredLines = lines.map((line) => {
            const trimmedLine = line.trim();
            if (!trimmedLine) return ''; // 空行
            
            if (trimmedLine.includes('《') && trimmedLine.includes('》')) {
                return `§6§l${trimmedLine}`; // 标题
            }
            else if (trimmedLine.startsWith('添加：')) {
                return `  §a${trimmedLine}`; // 添加
            }
            else if (trimmedLine.startsWith('优化：')) {
                return `  §e${trimmedLine}`; // 优化
            }
            else if (trimmedLine.startsWith('修复：')) {
                return `  §c${trimmedLine}`; // 修复
            }
            else if (trimmedLine.includes('日期')) {
                return `§7${trimmedLine}`; // 日期
            }
            else if (trimmedLine.includes('@全体成员')) {
                return `§c${trimmedLine}`; // @全体成员
            }
            else {
                return `§f${trimmedLine}`; // 普通文本
            }
        }).filter(line => line !== '');
        
        // 构建消息
        const timeStr = new Date().toLocaleTimeString('zh-CN', { 
            hour: '2-digit', 
            minute: '2-digit'
        });
        const dateStr = new Date().toLocaleDateString('zh-CN');
        
        const border = '§6═══════════';
        const mcMessage = 
            `\n${border}\n` +
            `§6§l群 公 告\n` +
            `${border}\n` +
            `\n` +
            `${coloredLines.join('\n')}\n` +
            `\n` +
            `${border}\n` +
            `§7发布者: §e${senderName || '未知'}\n` +
            `§7时间: §a${dateStr} ${timeStr}\n` +
            `${border}\n`;
        
        mc.broadcast(mcMessage);
        
        logger.info(` 公告已转发到MC服务器`);
        return true;
        
    } catch (error) {
        logger.error(` 转发到MC失败: ${error.message}`);
        return false;
    }
}

/**
 * 保存公告数据
 */
function saveAnnouncementData(e) {
    try {
        const msgKey = `${e.group_id}_${e.message_id}`;
        if (processedMessages.has(msgKey)) {
            return false;
        }
        
        processedMessages.add(msgKey);
        
        // 直接使用raw_message，它保留了换行
        let content = '';
        if (e.raw_message) {
            content = e.raw_message
                .replace(/\[CQ:[^\]]*\]/g, '')
                .replace(/\r\n/g, '\n')
                .replace(/\r/g, '\n')
                .trim();
        } else {
            content = extractCleanText(e);
        }
        
        const isAtAll = hasAtAll(e);
        const hasKeyword = hasKeywords(e);
        
        const announcement = {
            groupId: e.group_id,
            messageId: e.message_id,
            senderId: e.sender.user_id,
            senderName: e.sender.nickname || '未知',
            senderRole: e.sender.role || 'member',
            content: content,
            rawContent: e.raw_message || '',
            timestamp: e.time || Date.now(),
            hasAtAll: isAtAll,
            hasKeyword: hasKeyword
        };
        
        const data = {
            lastAnnouncement: announcement,
            lastUpdateTime: Date.now(),
            groupId: e.group_id
        };
        
        configFile.updateFile(config.dataFileName, data);
        
        config.lastProcessedMsgId = e.message_id;
        configFile.updateFile('config.json', config);
        
        logger.info(` 公告已保存: ${announcement.senderName}`);
        
        // 转发到MC
        if (config.enableMCForward) {
            setTimeout(() => {
                forwardToMC(content, announcement.senderName);
            }, 100);
        }
        
        return true;
    } catch (error) {
        logger.error(` 保存失败: ${error.message}`);
        return false;
    }
}

/**
 * 显示帮助信息
 */
function showHelp(reply) {
    const helpText = `🤖 GroupAnnounceListener - 使用帮助

📋 基础指令:
!查看配置      - 查看当前配置
!设置群 [群号] - 设置监听群组 (管理员)

💬 回复设置:
!开启回复      - 开启机器人回复 (管理员)
!关闭回复      - 关闭机器人回复 (管理员)

🔄 MC服务器设置:
!开启MC转发    - 开启MC服务器转发 (管理员)
!关闭MC转发    - 关闭MC服务器转发 (管理员)

🔑 关键词管理:
!查看词        - 查看关键词列表
!添加词 [词]   - 添加关键词 (管理员)
!删除词 [词]   - 删除关键词 (管理员)

🧪 测试指令:
!测试          - 测试当前消息
!测试公告      - 详细诊断信息
!查看公告      - 查看最新公告

📝 公告规则:
✅ 管理员发的消息
✅ 包含"公告"关键词 或 @全体成员
✅ 自动识别并保存

💡 提示: @我 或发送"帮助"查看此信息`;
    
    reply(helpText.trim());
}

/**
 * 检查是否@了机器人
 */
function hasAtBot(e) {
    try {
        let botId = null;
        if (spark.botId) botId = spark.botId;
        else if (spark.QClient && spark.QClient.botId) botId = spark.QClient.botId;
        
        if (!botId) return false;
        
        if (e.raw_message && e.raw_message.includes(`[CQ:at,qq=${botId}]`)) {
            return true;
        }
        
        if (e.message && Array.isArray(e.message)) {
            for (const segment of e.message) {
                if (segment.type === 'at' && segment.data) {
                    const qq = segment.data.qq || segment.data.user_id;
                    if (qq == botId) {
                        return true;
                    }
                }
            }
        }
        
        return false;
    } catch (error) {
        return false;
    }
}

/**
 * 处理命令
 */
function handleCommands(e, reply) {
    const { raw_message, sender } = e;
    const isAdmin = sender.role === 'owner' || sender.role === 'admin';
    
    if (raw_message === '帮助') {
        showHelp(reply);
        return;
    }
    
    if (raw_message === '!查看配置') {
        const status = `📊 当前配置
监听群组: ${config.targetGroup || '未设置'}
仅管理员: ${config.adminOnly ? '是' : '否'}
MC转发: ${config.enableMCForward ? '✅ 开启' : '❌ 关闭'}
回复确认: ${config.replyConfirm ? '✅ 开启' : '❌ 关闭'}
@机器人提示: ${config.showHelpWhenAtBot ? '开启' : '关闭'}
关键词: ${config.keywords.join(', ')}`;
        reply(status.trim());
    }
    
    else if (raw_message.startsWith('!设置群') && isAdmin) {
        const match = raw_message.match(/!设置群\s+(\d+)/);
        if (match) {
            config.targetGroup = parseInt(match[1]);
            configFile.updateFile('config.json', config);
            reply(`✅ 已设置监听群组: ${config.targetGroup}`);
        } else {
            reply('❌ 使用方法: !设置群 [群号]');
        }
    }
    
    else if (raw_message === '!开启回复' && isAdmin) {
        config.replyConfirm = true;
        configFile.updateFile('config.json', config);
        reply('✅ 已开启回复确认');
    }
    else if (raw_message === '!关闭回复' && isAdmin) {
        config.replyConfirm = false;
        configFile.updateFile('config.json', config);
        reply('✅ 已关闭回复确认');
    }
    
    else if (raw_message === '!开启MC转发' && isAdmin) {
        config.enableMCForward = true;
        configFile.updateFile('config.json', config);
        reply('✅ 已开启MC转发');
        logger.info('🔄 MC转发功能已开启');
    }
    else if (raw_message === '!关闭MC转发' && isAdmin) {
        config.enableMCForward = false;
        configFile.updateFile('config.json', config);
        reply('✅ 已关闭MC转发');
        logger.info('🔄 MC转发功能已关闭');
    }
    
    else if (raw_message.startsWith('!添加词') && isAdmin) {
        const keyword = raw_message.replace('!添加词', '').trim();
        if (keyword) {
            if (!config.keywords.includes(keyword)) {
                config.keywords.push(keyword);
                configFile.updateFile('config.json', config);
                reply(`✅ 已添加关键词: ${keyword}`);
            } else {
                reply('⚠️ 关键词已存在');
            }
        } else {
            reply('❌ 使用方法: !添加词 [关键词]');
        }
    }
    
    else if (raw_message.startsWith('!删除词') && isAdmin) {
        const keyword = raw_message.replace('!删除词', '').trim();
        if (keyword) {
            const index = config.keywords.indexOf(keyword);
            if (index > -1) {
                config.keywords.splice(index, 1);
                configFile.updateFile('config.json', config);
                reply(`✅ 已删除关键词: ${keyword}`);
            } else {
                reply('⚠️ 关键词不存在');
            }
        } else {
            reply('❌ 使用方法: !删除词 [关键词]');
        }
    }
    
    else if (raw_message === '!查看词') {
        reply(`📋 当前关键词: ${config.keywords.join(', ') || '无'}`);
    }
    
    else if (raw_message === '!测试') {
        const isAtAll = hasAtAll(e);
        const hasKeyword = hasKeywords(e);
        
        const result = `🧪 测试结果
是否管理员: ${isAdmin ? '是' : '否'}
包含@全体: ${isAtAll ? '✅ 是' : '❌ 否'}
包含关键词: ${hasKeyword ? '✅ 是' : '❌ 否'}
是否为公告: ${isAnnouncementMessage(e) ? '✅ 是' : '❌ 否'}
识别逻辑: 关键词 OR @全体成员`;
        reply(result.trim());
    }
    
    else if (raw_message === '!测试公告') {
        const isAtAll = hasAtAll(e);
        const hasKeyword = hasKeywords(e);
        const content = extractCleanText(e);
        const isAnnouncement = isAnnouncementMessage(e);
        
        const result = `🔍 详细测试
发送者: ${sender.nickname} (${sender.role})
内容: "${content}"
长度: ${content.length}字符
包含@全体: ${isAtAll ? '✅ 是' : '❌ 否'}
包含关键词: ${hasKeyword ? '✅ 是' : '❌ 否'}
关键词列表: ${config.keywords.join(', ')}
是否为公告: ${isAnnouncement ? '✅ 是' : '❌ 否'}
逻辑: 关键词(${hasKeyword}) OR @全体(${isAtAll}) = ${isAnnouncement}`;
        reply(result.trim());
    }
    
    else if (raw_message === '!查看公告') {
        const data = JSON.parse(configFile.getFile(config.dataFileName) || '{}');
        if (data.lastAnnouncement) {
            const ann = data.lastAnnouncement;
            const time = new Date(ann.timestamp).toLocaleString();
            reply(`📢 最新公告 (${time})
发布者: ${ann.senderName}
内容: ${ann.content.substring(0, 300)}${ann.content.length > 300 ? '...' : ''}
触发条件: ${ann.hasAtAll ? '@全体' : ''}${ann.hasAtAll && ann.hasKeyword ? ' + ' : ''}${ann.hasKeyword ? '关键词' : ''}`);
        } else {
            reply('暂无公告记录');
        }
    }
    
    else if (raw_message === '!记录公告' && isAdmin) {
        saveAnnouncementData(e);
        reply('✅ 已强制记录为公告');
    }
}

/**
 * 主消息处理
 */
spark.on('message.group.normal', async (e, reply) => {
    try {
        const { group_id, raw_message } = e;
        
        // 处理帮助请求
        const isAtBot = hasAtBot(e);
        if (config.showHelpWhenAtBot && (isAtBot || raw_message === '帮助')) {
            if (isAtBot) {
                showHelp(reply);
                return;
            }
        }
        
        // 处理命令
        handleCommands(e, reply);
        
        // 检查是否为公告（如果不是命令且不是帮助）
        if (!raw_message.startsWith('!') && raw_message !== '帮助') {
            if (isAnnouncementMessage(e)) {
                logger.info(`🎯 检测到公告消息！`);
                
                saveAnnouncementData(e);
                
                if (config.replyConfirm) {
                    reply('✅ 公告已记录！');
                }
            }
        }
        
    } catch (error) {
        logger.error(`❌ 处理消息时出错: ${error.message}`);
    }
});

// 机器人上线
spark.on('bot.online', () => {
    logger.info(' GroupAnnounceListener 插件已启动');
    logger.info(` 版本: 1.0.0`);
    logger.info(` 作者: IKUN2004`);
    logger.info(` 识别逻辑: 关键词 OR @全体成员`);
    
    if (config.targetGroup) {
        logger.info(`📢 监听群组: ${config.targetGroup}`);
    } else {
        logger.warn('⚠️ 未设置监听群组，请使用 !设置群 [群号] 进行设置');
    }
    
    logger.info(`🔄 MC转发: ${config.enableMCForward ? ' 开启' : ' 关闭'}`);
    logger.info(`💬 回复确认: ${config.replyConfirm ? ' 开启' : ' 关闭'}`);
});

// 初始化完成
logger.info(' GroupAnnounceListener v1.0.0 加载完成');