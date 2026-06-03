import "dotenv/config"
import express from "express"
import cors from "cors"
import authRoutes from "./routes/auth"
import vendorRoutes from "./routes/vendor"

const app = express()
const PORT = process.env.PORT ?? 5000

app.use(cors({
  origin: process.env.FRONTEND_URL,
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type", "Authorization"],
}))

app.use(express.json())

app.get("/health", (_req, res) => res.json({ ok: true, service: "CogniVend API" }))
app.use("/api/auth", authRoutes)
app.use("/api/vendor", vendorRoutes)

app.listen(PORT, () => {
  console.log(`CogniVend API running on port ${PORT}`)
})
