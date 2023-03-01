import type { Context } from 'grammy';
import type { MessageEntity } from 'grammy/out/types.node';

export const KNOW_ENTITY_TYPES = [
	'bold',
	'text_link',
	'url',
	'italic',
	'code',
	'strikethrough',
	'underline',
	'pre',
	'mention',
	'email',
	'phone_number'
];

export const parseTelegramMessage = (ctx: Context) => {
	const text = ctx.msg?.text || ctx.msg?.caption;
	const entities = (ctx.msg?.entities || ctx.msg?.caption_entities)?.filter((e) => KNOW_ENTITY_TYPES.includes(e.type));

	if (!entities || !text) {
		return text;
	}

	let tags: { index: number; tag: string | undefined }[] = [];

	entities.forEach((entity) => {
		const startTag = getTag(entity, text);
		let searchTag = tags.filter((tag) => tag.index === entity.offset);
		if (searchTag.length > 0 && startTag) searchTag[0].tag += startTag;
		else
			tags.push({
				index: entity.offset,
				tag: startTag
			});

		const closeTag = startTag?.indexOf('<a ') === 0 ? '</a>' : '</' + startTag?.slice(1);
		searchTag = tags.filter((tag) => tag.index === entity.offset + entity.length);
		if (searchTag.length > 0) searchTag[0].tag = closeTag + searchTag[0].tag;
		else
			tags.push({
				index: entity.offset + entity.length,
				tag: closeTag
			});
	});
	let html = '';
	for (let i = 0; i < text.length; i++) {
		const tag = tags.filter((tag) => tag.index === i);
		tags = tags.filter((tag) => tag.index !== i);
		if (tag.length > 0) html += tag[0].tag;
		html += text[i];
	}
	if (tags.length > 0) html += tags[0].tag;
	return html;
};

const getTag = (entity: MessageEntity, text: string) => {
	const entityText = text.slice(entity.offset, entity.offset + entity.length);

	switch (entity.type) {
		case 'bold':
			return `<strong>`;
		case 'text_link':
			return `<a href="${entity.url}" target="_blank">`;
		case 'url':
			return `<a href="${entityText}" target="_blank">`;
		case 'italic':
			return `<em>`;
		case 'code':
			return `<code>`;
		case 'strikethrough':
			return `<s>`;
		case 'underline':
			return `<u>`;
		case 'pre':
			return `<pre>`;
		case 'mention':
			return `<a href="https://t.me/${entityText.replace('@', '')}" target="_blank">`;
		case 'email':
			return `<a href="mailto:${entityText}">`;
		case 'phone_number':
			return `<a href="tel:${entityText}">`;
	}
};
