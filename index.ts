import { Bot, Context, GrammyError, HttpError, type NextFunction } from 'grammy';
import { dialogsDB, getConnections, getHistoryMessages, historyDB } from './db';
import { parseTelegramMessage } from './textParsing';
import { parseMode } from '@grammyjs/parse-mode';
import { run } from "@grammyjs/runner";
import { autoRetry } from '@grammyjs/auto-retry'
// @ts-ignore
import businessHours from "business-hours.js";
import moment from 'moment';
import * as dotenv from 'dotenv';
import { Connection, defaultBusinessHours, parseBusinessHour } from './utils';
dotenv.config()

const added: Array<string> = []

async function handleMessage(ctx: Context, connection: Connection) {
    const source = ctx.chat?.id
    const source_msg_id = ctx.msg?.message_id
    if (connection.business_hours) {
        businessHours.init(parseBusinessHour(connection.business_hours));
        // @ts-ignore
        let now = moment().tz(defaultBusinessHours.timeZone)
        now.subtract(1, "minutes")
        if (businessHours.isClosedNow(now)) return;
    }
    const destination = Number(connection.destination)
    const whitelist_pattern = connection.whitelist_pattern ? new RegExp(connection.whitelist_pattern?.toString()) : undefined
    const blacklist_pattern = connection.blacklist_pattern ? new RegExp(connection.blacklist_pattern?.toString()) : undefined
    const disable_web_page_preview = !!connection.disable_web_page_preview
    if (whitelist_pattern && !((ctx.msg?.text || ctx.msg?.caption)?.match(whitelist_pattern))) return;
    if (blacklist_pattern && (ctx.msg?.text || ctx.msg?.caption)?.match(new RegExp(blacklist_pattern))) return;

    try {
        // @ts-ignore
        if (ctx?.msg?.poll) { 
            return await ctx.copyMessage(destination);
        } else {
            let reply_to_message_id: number|undefined = undefined
            // @ts-ignore
            if (ctx.msg?.reply_to_message?.message_id) {
                // @ts-ignore
                const historyMesssages = await historyDB.fetch({ botKey, connection: connection.key, source: ctx.chat.id, source_msg_id: ctx.msg?.reply_to_message.message_id, destination: destination }, { limit: 1 })
                if (historyMesssages.items?.length) reply_to_message_id = historyMesssages.items?.[0].destination_msg_id as number || undefined
            }
            const originalText = parseTelegramMessage(ctx) || '';
            if (connection.sendType === 'fwd') {
                // @ts-ignore
                return ctx.forwardMessage(destination);
            } else {
                const processedText = await getProcessedText(originalText, connection);
                // @ts-ignore
                const sentMessage = ctx?.msg?.text ? await ctx.api.sendMessage(destination, processedText, { reply_to_message_id, disable_web_page_preview }) : await ctx.copyMessage(destination, { caption: processedText , reply_to_message_id })
                return await historyDB.put({ botKey, connection: connection.key, source, destination, source_msg_id, destination_msg_id: sentMessage.message_id })
            }
        }
    } catch (err) {
        await ctx.api
            .sendMessage(-886439865, `Connection Name: ${connection.name}\nSource: ${connection.source}\nDestination: ${connection.destination}\nError: ${err}`)
            .catch(err => console.log(err))
    }
}

const handleEditedMessage = async (ctx: Context, connection: Connection) => {
	if (!(ctx && ctx.msg && ctx.chat)) return;

	try {
		const destination = Number(connection.destination);
		const whitelist_pattern = connection.whitelist_pattern
			? new RegExp(connection.whitelist_pattern?.toString())
			: undefined;
		const blacklist_pattern = connection.blacklist_pattern
			? new RegExp(connection.blacklist_pattern?.toString())
			: undefined;
		const disable_web_page_preview = !!connection.disable_web_page_preview;
		if (whitelist_pattern && !(ctx.msg?.text || ctx.msg?.caption)?.match(whitelist_pattern))
			return;
		if (
			blacklist_pattern &&
			(ctx.msg?.text || ctx.msg?.caption)?.match(new RegExp(blacklist_pattern))
		)
			return;

		const historyMesssages = await getHistoryMessages(
			{
				connection: connection.key,
				source: ctx.chat.id,
				source_msg_id: ctx.msg.message_id,
				destination: destination
			}
		);
		if (!historyMesssages?.length) return;
		const originalText = parseTelegramMessage(ctx) || '';
		const processedText = await getProcessedText(originalText, connection);
		const handlers = []
		for (const history of historyMesssages) {
			const message_id = Number(history.destination_msg_id) || undefined;
			if (!message_id) continue;
			handlers.push(
				ctx.api.editMessageText(destination, message_id, processedText, {
					disable_web_page_preview
				})
			)
		}
		await Promise.all(handlers);
	} catch (err) {
		console.log(err);
	}
}

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
	text = text.replaceAll(/<a.*?href="([^"]+?)\/?".*>.+?<\/a>/gi, "$1")
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
bot.on('msg:new_chat_title', async (ctx: Context) => {
    await dialogsDB.put({ ...ctx.chat, botKey: ctx.me.id.toString()  }, `${ctx.me.id}:${ctx.chat?.id}`);
})

bot.on('msg', async (ctx: Context) => {
    const before = Date.now();
    const connections = await getConnections(botKey);
    const handlers = []
    const relevantConnections = connections.filter(connection => 
        // check connection has filters
        connection?.filters?.length &&
        // select connections for this source
        connection.source === ctx?.chat?.id?.toString() &&
        // check message type is selected
        ctx.has(connection?.filters.filter((f: string) => !f?.match(/:checked$/)))
    )
    for (const connection of relevantConnections) {
        handlers.push(handleMessage(ctx, connection))
    }
    const results = []
    while (handlers.length) {
        const _result = await Promise.all( handlers.splice(0, 30).map(f => f) )
        results.push(..._result.filter(r => r))
        // if (handlers.length && _result.filter(r => r).length) await new Promise(r => setTimeout(r, 500));
    }
    const after = Date.now();
    if (results.length) {
        await ctx.api
		.sendMessage(-886439865	, `${ctx.me.username}: Took ${after - before} ms\nhttps://t.me/c/${ctx?.chat?.id}/${ctx.msg?.message_id}`)
		.catch(err => console.log(err))
    }
});

bot.on('edit', async (ctx: Context) => {
    const handlers = []
    const connections = await getConnections(botKey);
    const relevantConnections = connections.filter(connection => 
        // check connection has filters
        connection?.filters?.length &&
        // select connections for this source
        connection.source === ctx?.chat?.id?.toString() &&
        // check message type is selected
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        ctx.has(connection?.filters.filter((f: string) => !f?.match(/:checked$/)).map(f => f === 'msg' ? 'edit' : `edit:${f}`))
    )
    for (const connection of relevantConnections) {
        handlers.push(handleEditedMessage(ctx, connection))
    }
    const results = []
    while (handlers.length) {
        const _result = await Promise.all( handlers.splice(0, 30).map(f => f) )
        results.push(..._result.filter(r => r))
        // if (handlers.length && _result.filter(r => r).length) await new Promise(r => setTimeout(r, 500));
    }
});

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

bot.start();
// run(bot);
