Zen-AI-Fax Backend (Full)

Quick start (local):
  cd backend
  npm install
  npm start

Optional Azure integration (set env vars):
  AZURE_STORAGE_CONNECTION_STRING - connection string for storage account
  AZURE_CONTAINER - container name (default: faxes)
  FORM_RECOGNIZER_ENDPOINT - endpoint for Form Recognizer (https://...)
  FORM_RECOGNIZER_KEY - key for Form Recognizer

Notes:
  - If Azure env vars are not set, files will be stored locally under backend/uploads and analyzer uses a mock heuristic.
  - Database is a local SQLite DB at backend/data/fax.db for quick testing.
