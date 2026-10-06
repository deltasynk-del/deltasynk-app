# DeltaSynk Portal

The operations system behind the DeltaSynk products. Staff use it to approve SMS
sender IDs and to verify subscription payments and SMS top-ups that
**QualitySchool**, **SynkMart** and the **DeltaSynk website** send in.

Same stack as `~/qualityschool-app`: **Angular 19** (Material + Tailwind) +
**NestJS 11** + **Prisma 6** + **PostgreSQL**.

```
deltasynk_portal/
├── backend/    NestJS API  (port 3030)
├── frontend/   Angular app (port 4220)
├── Caddyfile   HTTPS reverse proxy for portal.deltasynk.com
└── docker-compose.yml
```

## Run locally

```bash
# 1. Database (Homebrew Postgres on port 5433, like the other apps)
createdb -p 5433 deltasynk_portal        # once

# 2. API
cd backend
cp .env.example .env                     # set JWT_SECRET, SEED_OWNER_EMAIL, SEED_OWNER_PASSWORD
npm install
npx prisma migrate dev
npm run db:seed                          # creates the first owner + the three connected apps
npm run start:dev

# 3. Web app (separate terminal)
cd frontend
npm install
npm start
```

- Web: http://localhost:4220
- API health: http://localhost:3030/api/v1/health

## Deploy online

The production Compose stack builds the API and web app and keeps PostgreSQL on
a private Docker network. Coolify's proxy provides public routing and HTTPS;
Nginx in the frontend container forwards `/api/` requests to the backend. Before
deploying it:

1. Point the domain's DNS A record at the server's public IPv4 address. If the
  server is not reachable over IPv6, remove any AAAA record for the domain.
2. Allow inbound TCP ports 80 and 443 through the server firewall.
3. In Coolify, route **https://portal.deltasynk.com** to the frontend service on
  internal port `80`; Coolify handles the TLS certificate.
4. Either copy `.env.production.example` to `.env.production` and replace every
  placeholder, or enter the variables in your hosting provider's environment
  settings. Keep local env files private; they are ignored by Git. Use unique,
  randomly generated database, JWT, and encryption secrets for each
  environment. The database URL must use the same database credentials, point
  to host `postgres` on the Compose network, and percent-encode special
  characters in the password.
5. Configure working SMTP credentials. Password reset and email verification
  require SMTP; production responses never expose development links or codes.
6. Deploy the Compose application and create the first owner:

  ```bash
  docker compose exec backend npm run db:seed
  ```

The app is served at `https://portal.deltasynk.com` and its API at
`https://portal.deltasynk.com/api/v1`. The DNS record must resolve to the
Coolify server before deployment. Database data persists in a named Docker
volume.

Sign in with `SEED_OWNER_EMAIL` / `SEED_OWNER_PASSWORD`. The owner is asked to
choose a new password straight away.

## Sign-in and security

- Sign in with **email or phone number** + password.
- **Two-step verification** is optional per user (My account & security):
  authenticator app, email code or SMS code, plus one-time recovery codes.
- 5 wrong passwords or codes pause the account for 15 minutes.
- New users get a temporary password and must replace it at first sign-in.
- Changing a password, role or active status ends that user's other sessions.
- Locked out with nobody to help: `npm run user:reset-access -- <email>` in `backend/`.

Email codes / reset links need SMTP settings and SMS codes need Onfon settings in
`backend/.env`. Without them, development builds show the code or link on screen.

## Access levels

Roles are bundles of permissions defined in one file,
`backend/src/access/permissions.ts`. Every API route declares the permission it
needs; a route with no declaration is refused.

| Role | App | Can do |
|------|-----|--------|
| Owner | Web | Everything, including users, connected apps and the activity log |
| Manager | Web | Approve sender IDs, verify payments; view users, apps, activity log |
| Front office | Web | See all requests; cannot approve or verify |
| Marketing manager | Mobile | Dashboard and subscription payments (read only) |
| Marketing officer | Mobile | Dashboard only, until marketing features exist |

The mobile app will use the same API and the same rules.

## How the apps connect

Each app gets its own key under **Connected apps** and sends it as
`x-portal-api-key`.

| Call | Purpose |
|------|---------|
| `POST /api/v1/ingest/sender-ids` | A school/shop requested a sender ID |
| `GET /api/v1/ingest/sender-ids/:externalId` | Read the decision |
| `POST /api/v1/ingest/payments` | A subscription payment or SMS top-up (`kind`, `status`) |
| `GET /api/v1/ingest/payments/:reference` | Read the result (`canProceed`) |
| `POST /api/v1/ingest/product-labels/claim` | A shop claims a product barcode label batch (`code`, `tenantRef`, `tenantName`); returns its products and barcodes |
| `POST /api/v1/ingest/warranty-packs/claim` | A shop claims a printed warranty card pack (`code`, `tenantRef`, `tenantName`); returns its card numbers |

Field lists are in `backend/src/ingest/dto/ingest.dto.ts`. Re-sending the same id
or reference updates the request; one that staff already decided is never reopened.

Sender ID decisions can also be pushed to QualitySchool and SynkMart through
their existing `/platform/sender-ids/:id/approve|reject` endpoints — set the
app's API address and platform key under Connected apps → Connection.
