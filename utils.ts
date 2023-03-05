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

export const parseBusinessHour = (businessHours: {[key: string]: string|Array<{from: string, to: string, key: string}>}) => {
	const hours = {...defaultBusinessHours, ...businessHours}
	return Object.fromEntries(Object.entries(hours).map(([_, v]) => {
		if (typeof v === 'object') v.forEach(function(v){ delete v?.['key'] });
		return v.length ? [_, v] : [_, 'closed'] 
	}));
}