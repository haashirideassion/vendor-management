import "dotenv/config"
import express from "express"
import cors from "cors"
import cookieParser from "cookie-parser"
import authRoutes from "./routes/auth"
import vendorRoutes from "./routes/vendor"
import vendorsRoutes from "./routes/vendors"
import purchaseOrdersRoutes from "./routes/purchaseOrders"
import invoicesRoutes from "./routes/invoices"
import contractsRoutes from "./routes/contracts"
import engagementsRoutes from "./routes/engagements"
import rfqsRoutes from "./routes/rfqs"
import quotationsRoutes from "./routes/quotations"
import notificationsRoutes from "./routes/notifications"
import attachmentsRoutes from "./routes/attachments"
import grnsRoutes from "./routes/grns"
import approvalsRoutes from "./routes/approvals"
import categoriesRoutes from "./routes/categories"
import ratingsRoutes from "./routes/ratings"
import documentsRoutes from "./routes/documents"
import analyticsRoutes from "./routes/analytics"
import auditLogRoutes from "./routes/auditLog"
import organizationsRoutes from "./routes/organizations"
import superadminRoutes from "./routes/superadmin"
import accessRoutes from "./routes/access"
import orgMembersRoutes from "./routes/orgMembers"
import vendorUsersRoutes from "./routes/vendorUsers"
import groupsRoutes from "./routes/groups"
import orgOnboardingRoutes from "./routes/orgOnboarding"
import vendorInviteLinksRoutes from "./routes/vendorInviteLinks"

const app = express()
const PORT = process.env.PORT ?? 5000

const allowedOrigins = [
  process.env.FRONTEND_URL,
  "http://127.0.0.1:5173",
  "http://127.0.0.1:5174",
  "http://127.0.0.1:3000",
  "http://localhost:5173",
  "http://localhost:5174",
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
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Org-Id"],
  credentials: true,
}))

app.use(express.json({ limit: '50mb' }))
app.use(express.urlencoded({ limit: '50mb', extended: true }))
app.use(cookieParser())

app.get("/health", (_req, res) => res.json({ ok: true, service: "CogniVend API" }))
app.use("/api/auth", authRoutes)
app.use("/api/vendor", vendorRoutes)
app.use("/api/vendors", vendorsRoutes)
app.use("/api/purchase-orders", purchaseOrdersRoutes)
app.use("/api/invoices", invoicesRoutes)
app.use("/api/contracts", contractsRoutes)
app.use("/api/engagements", engagementsRoutes)
app.use("/api/rfqs", rfqsRoutes)
app.use("/api/quotations", quotationsRoutes)
app.use("/api/notifications", notificationsRoutes)
app.use("/api/attachments", attachmentsRoutes)
app.use("/api/grns", grnsRoutes)
app.use("/api/approvals", approvalsRoutes)
app.use("/api/categories", categoriesRoutes)
app.use("/api/ratings", ratingsRoutes)
app.use("/api/documents", documentsRoutes)
app.use("/api/analytics", analyticsRoutes)
app.use("/api/audit-log", auditLogRoutes)
app.use("/api/organizations", organizationsRoutes)
app.use("/api/superadmin", superadminRoutes)
app.use("/api/access", accessRoutes)
app.use("/api/org-members", orgMembersRoutes)
app.use("/api/vendor-users", vendorUsersRoutes)
app.use("/api/groups", groupsRoutes)
app.use("/api/org-onboarding", orgOnboardingRoutes)
app.use("/api/vendor-invite-links", vendorInviteLinksRoutes)

if (process.env.NODE_ENV !== "production" && process.env.NODE_ENV !== "test") {
  app.listen(PORT, () => {
    console.log(`CogniVend API running on port ${PORT}`)
  })
}

export default app
