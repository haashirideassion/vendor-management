import "dotenv/config"
import express from "express"
import cors from "cors"
import authRoutes from "./routes/auth"
import vendorRoutes from "./routes/vendor"

const app = express()
const PORT = process.env.PORT ?? 5000

const allowedOrigins = [
  process.env.FRONTEND_URL,
  "http://localhost:5173",
  "http://localhost:3000",
].filter(Boolean) as string[]

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true)
    } else {
      callback(new Error("Not allowed by CORS"))
    }
  },
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type", "Authorization"],
}))

app.use(express.json())

app.get("/health", (_req, res) => res.json({ ok: true, service: "CogniVend API" }))
app.use("/api/auth", authRoutes)
app.use("/api/vendor", vendorRoutes)

if (process.env.NODE_ENV !== "production") {
  app.listen(PORT, () => {
    console.log(`CogniVend API running on port ${PORT}`)
  })
}

export default app
