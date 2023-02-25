import { Deta } from 'deta';
import * as cache from 'node-cache'

const mycache = new cache.default({ stdTTL: 10 })
const deta = Deta("c0XVNaHgiYav_nhf4hzbSd1XZDjrb6hLJ6h1Amgttwwd9")
export const connectionsDB = deta.Base('connections')
export const usersDB = deta.Base('users')
export const dialogsDB = deta.Base('dialogs')
export const tokensDB = deta.Base('tokens')
export const historyDB = deta.Base('history')

export const getConnections = async () => {
    if (mycache.get('connections')) return mycache.get('connections');
    let res = await connectionsDB.fetch();
    let connections = res.items;
    while (res.last){
        res = await connectionsDB.fetch({}, {last: res.last});
        connections = connections.concat(res.items);
    }
    mycache.set('connections', connections)
    return connections
}
