import { Deta } from 'deta';
import * as cache from 'node-cache'

const mycache = new cache.default({ stdTTL: 10 })
const deta = Deta("c0XVNaHgiYav_nhf4hzbSd1XZDjrb6hLJ6h1Amgttwwd9")
export const connectionsDB = deta.Base('connections')
export const usersDB = deta.Base('users')
export const dialogsDB = deta.Base('dialogs')
export const tokensDB = deta.Base('tokens')
export const historyDB = deta.Base('history')

export const getConnections = async (botKey: string) => {
	const connectionsKey = `${botKey}:connections`
    const query = { enabled: true, botKey }
	if (!mycache.get(connectionsKey)) {
		let res = await connectionsDB.fetch(query);
		let connections = res.items;
		while (res.last){
			res = await connectionsDB.fetch(query, {last: res.last});
			connections = connections.concat(res.items);
		}
		mycache.set(connectionsKey, connections, 10)
	};
	return mycache.get(connectionsKey);
};
