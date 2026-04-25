# AI-ASSISTED-ELECTRONIC-VOTING-SYSTEM

## Connect to PostgreSQL (pgAdmin)

This project backend reads `DATABASE_URL` from a root `.env` file and uses it in `backend/db.py`.

1. In pgAdmin, confirm your database exists with the exact name: `national election board`.
2. Create a root `.env` file at `FinalProject/.env`.
3. Add this (replace username/password with your PostgreSQL credentials):

```env
DATABASE_URL=postgresql+psycopg://postgres:YOUR_PASSWORD@localhost:5432/national%20election%20board
BACKEND_PORT=5000
FLASK_DEBUG=true
FRONTEND_ORIGIN=http://localhost:3000
```

Important: because the DB name has spaces, it must be URL-encoded as `national%20election%20board`.

## Run frontend + backend

1. Backend:
   - `cd backend`
   - `pip install -r requirements.txt`
   - `python app.py`
2. Frontend (new terminal):
   - `cd frontend`
   - `npm install`
   - `npm run dev`

Open `http://localhost:3000`.

## Election Officer voter verification flow

- The page `frontend/app/election-officer/verify-voter/page.tsx` now calls:
  - `GET /api/voters/lookup?q=<identifier>&limit=25`
- Required headers are already sent by frontend:
  - `X-Role: ElectionOfficer`
  - `X-User-Id: <logged in officer id>` (from local storage)
- You must be logged in as an active Election Officer account for lookup to succeed.

## OTP delivery modes (educational project)

OTP behavior is configured in `backend/services/otp_service.py` using environment variables.

### 1) Demo mode (default)

No real SMS/email is sent. OTP is generated and may be returned in API response.

```env
OTP_PROVIDER=demo
OTP_EXPOSE_IN_RESPONSE=true
OTP_EXPIRES_MINUTES=5
OTP_MAX_ATTEMPTS=5
OTP_RESEND_COOLDOWN_SECONDS=30
```

### 2) Real email OTP via SMTP

```env
OTP_PROVIDER=email
OTP_EXPOSE_IN_RESPONSE=false
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_email_app_password
SMTP_FROM=your_email@gmail.com
```

### 3) Real SMS OTP via Twilio

```env
OTP_PROVIDER=twilio
OTP_EXPOSE_IN_RESPONSE=false
TWILIO_ACCOUNT_SID=your_account_sid
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_FROM=+1XXXXXXXXXX
```