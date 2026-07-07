import server from "../../backend/src/server"

const app = (server as any).default?.default ?? (server as any).default ?? server

export default app
module.exports = app
