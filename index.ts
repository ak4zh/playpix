import { Bot, Context, GrammyError, HttpError, type NextFunction } from 'grammy';
import { dialogsDB, getConnections, historyDB } from './db';
import { parseTelegramMessage } from './textParsing';
import { parseMode } from '@grammyjs/parse-mode';
import { run } from "@grammyjs/runner";
import { autoRetry } from '@grammyjs/auto-retry'
import * as dotenv from 'dotenv';
dotenv.config()

const added: Array<string> = []

async function saveDialog(ctx: Context, next: NextFunction): Promise<void> {
	const chatKey = `${ctx.me.id}:${ctx.chat?.id}`
	if (!added.includes(chatKey)) {
		added.push(chatKey);
		await dialogsDB.put({ ...ctx.chat, botKey: ctx.me.id.toString()  }, chatKey);
	}
	await next();
}

async function getProcessedText(text: string, connection: any) {
	for (const manipulation of connection?.text_manipulations || []) {
		const pattern = new RegExp(manipulation.pattern, (manipulation?.flags?.join('')||'') + 'g')
		text = (text||'')?.replaceAll(pattern, manipulation?.replacement || '')
	}
	text = connection.template.replace(/\[\[ProcessedText]]/g, text)
	return text
}

const botToken = process.env.BOT_TOKEN;
if (!botToken) {
    throw Error("BOT_TOKEN is required");
}
const botKey = process.env.BOT_TOKEN?.split(':')[0] as string;
const bot = new Bot(botToken);
bot.api.config.use(parseMode('html'));
bot.api.config.use(autoRetry());

bot.use(saveDialog);
bot.command('start', async (ctx) => await ctx.reply('Welcome!'))
bot.api.deleteWebhook().catch(err => console.log(err))
bot
    .on('msg', async (ctx) => {
        if (ctx && ctx.msg && ctx.chat) {
            const connections = await getConnections(botKey);
            // @ts-ignore
            for (const connection of connections.filter(c => c?.filters?.length)) {
                if (ctx?.chat?.id?.toString() !== connection.source) continue;
                const destination = Number(connection.destination)
                const whitelist_pattern = connection.whitelist_pattern ? new RegExp(connection.whitelist_pattern?.toString()) : undefined
                const blacklist_pattern = connection.blacklist_pattern ? new RegExp(connection.blacklist_pattern?.toString()) : undefined
                const disable_web_page_preview = !!connection.disable_web_page_preview
                if (whitelist_pattern && !((ctx.msg?.text || ctx.msg?.caption)?.match(whitelist_pattern))) continue;
                if (blacklist_pattern && (ctx.msg?.text || ctx.msg?.caption)?.match(new RegExp(blacklist_pattern))) continue;
                // @ts-ignore
                if (!ctx.has((connection?.filters).filter(f => !f?.match(/:checked$/)))) continue;

                try {
                    // @ts-ignore
                    if (ctx?.msg?.poll) { await ctx.copyMessage(destination);
                    } else {
                        let reply_to_message_id = undefined
                        // @ts-ignore
                        if (ctx.msg?.reply_to_message?.message_id) {
                            // @ts-ignore
                            const historyMesssages = await historyDB.fetch({ botKey, connection: connection.key, source: ctx.chat.id, source_msg_id: ctx.msg?.reply_to_message.message_id, destination: destination }, { limit: 1 })
                            if (historyMesssages.items?.length) reply_to_message_id = historyMesssages.items?.[0].destination_msg_id
                        }
                        const originalText = parseTelegramMessage(ctx) || '';
                        if (connection.sendType === 'fwd') {
                            // @ts-ignore
                            await ctx.forwardMessage(destination);
                        } else {
                            const processedText = await getProcessedText(originalText, connection);
                            // @ts-ignore
                            const sentMessage = ctx?.msg?.text ? await ctx.api.sendMessage(destination, processedText, { reply_to_message_id, disable_web_page_preview }) : await ctx.copyMessage(destination, { caption: processedText , reply_to_message_id })
                            // @ts-ignore
                            await historyDB.put({ botKey, connection: connection.key, source: ctx.chat.id, destination: destination, source_msg_id: ctx.msg.message_id, destination_msg_id: sentMessage.message_id })		
                        }
                    }
                } catch (err) {
                    try {
                        await ctx.api.sendMessage(1889829639, `Connection Name: ${connection.name}\nSource: ${connection.source}\nDestination: ${connection.destination}\nError: ${err}`)
                    } catch (er) {
                        console.log(er)
                    }
                }
            }
        }
    })

bot
    .on('edited_message', async (ctx) => {
        if (ctx && ctx.msg && ctx.chat) {
            const connections = await getConnections(botKey);
            // @ts-ignore
            for (const connection of connections.filter(c => c?.filters?.length)) {
                try {
                    if (ctx?.chat?.id?.toString() !== connection.source) continue;
                    const destination = Number(connection.destination)
                    const whitelist_pattern = connection.whitelist_pattern ? new RegExp(connection.whitelist_pattern?.toString()) : undefined
                    const blacklist_pattern = connection.blacklist_pattern ? new RegExp(connection.blacklist_pattern?.toString()) : undefined
                    const disable_web_page_preview = !!connection.disable_web_page_preview
                    if (whitelist_pattern && !((ctx.msg?.text || ctx.msg?.caption)?.match(whitelist_pattern))) continue;
                    if (blacklist_pattern && (ctx.msg?.text || ctx.msg?.caption)?.match(new RegExp(blacklist_pattern))) continue;
                    // @ts-ignore
                    if (!ctx.has((connection?.filters).filter(f => !f?.match(/:checked$/)))) continue;
                    // @ts-ignore
                    const historyMesssages = await historyDB.fetch({ botKey, connection: connection.key, source: ctx.chat.id, source_msg_id: ctx.msg.message_id, destination: destination }, { limit: 1 })
                    if (!historyMesssages.items?.length) return
                    const originalText = parseTelegramMessage(ctx) || '';
                    const processedText = await getProcessedText(originalText, connection);
                    for (const history of historyMesssages.items) {
                        // @ts-ignore
                        await ctx.api.editMessageText(destination, history.destination_msg_id, processedText, { disable_web_page_preview })
                    };	
                } catch (err) {console.log(err)}
            }
        }
    })

bot.catch((err) => {
    const ctx = err.ctx;
    console.error(`Error while handling update ${ctx.update.update_id}:`);
    const e = err.error;
    if (e instanceof GrammyError) {
        console.error("Error in request:", e.description);
    } else if (e instanceof HttpError) {
        console.error("Could not contact Telegram:", e);
    } else {
        console.error("Unknown error:", e);
    }
    });

// bot.start()
run(bot);
