import { FilterQuery } from 'grammy';
import * as yup from 'yup';

export const defaultBusinessHours = {
	Monday: [],
	Tuesday: [],
	Wednesday: [],
	Thursday: [],
	Friday: [],
	Saturday: [],
	Sunday: [],
	timeZone: 'America/Sao_Paulo'
};

export const parseBusinessHour = (businessHours: yup.InferType<typeof businessHoursSchema>) => {
	const hours = {...defaultBusinessHours, ...businessHours}
	return Object.fromEntries(Object.entries(hours).map(([_, v]) => {
		if (typeof v === 'object') v.forEach(function(v){ delete v.key });
		return v.length ? [_, v] : [_, 'closed'] 
	}));
}

const businessDaySchema = yup.array().of(
	yup.object({
		key: yup.string(),
		from: yup
			.string()
			.trim()
			.matches(/\d\d:\d\d/),
		to: yup
			.string()
			.trim()
			.matches(/\d\d:\d\d/)
	})
)

const businessHoursSchema = yup.object({
	Monday: businessDaySchema,
	Tuesday: businessDaySchema,
	Wednesday: businessDaySchema,
	Thursday: businessDaySchema,
	Friday: businessDaySchema,
	Saturday: businessDaySchema,
	Sunday: businessDaySchema,
	timezone: yup.string().default("America/Sao_Paulo")
})

export const schema = yup.object({
	key: yup.string(),
	sendType: yup.string().oneOf(['fwd', 'copy']),
	name: yup.string(),
	source: yup.string(),
	template: yup.string(),
	destination: yup.string(),
	whitelist_pattern: yup.string(),
	blacklist_pattern: yup.string(),
	disable_web_page_preview: yup.bool(),
	business_hours: businessHoursSchema,
	text_manipulations: yup.array().of(
		yup.object({
			pattern: yup
				.string()
				.required('Please enter the text / pattern to match.')
				.required('Please enter match pattern'),
			flags: yup.array().of(yup.string()),
			replacement: yup.string()
		})
	),
	filters: yup
		.array()
		.of(yup.mixed<FilterQuery>().required())
		.min(1, 'Select at least one custom filter')
		.required()
});

export type Connection = yup.InferType<typeof schema>;
