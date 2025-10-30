/**
 * Zen-AI-Fax Backend (full).
 * - POST /upload : upload fax PDF/image
 * - GET /documents : list documents
 * - GET /document/:id : get document + extracted fields
 *
 * Behavior:
 * - If AZURE_STORAGE_CONNECTION_STRING is set, uploaded files are uploaded to Azure Blob (container 'faxes'),
 *   otherwise files are stored locally under ./uploads and the file path is used as blob_url.
 * - If FORM_RECOGNIZER_ENDPOINT and FORM_RECOGNIZER_KEY are set, the Azure DocumentAnalysisClient is used.
 *   Otherwise a mock analyzer is used (filename-based heuristics).
 *
 * Run locally:
 *   cd backend
 *   npm install
 *   npm start
 */
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const db = require('./services/db');
const azureBlob = require('./services/azureBlob');
const analyzer = require('./services/analyzer');

const UPLOAD_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => cb(null, Date.now() + '_' + file.originalname.replace(/\s+/g,'_'))
});
const upload = multer({ storage });

const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.get('/documents', async (req, res) => {
  try {
    const docs = await db.listDocuments();
    res.json({ success: true, documents: docs });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'db error' });
  }
});

app.get('/document/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const doc = await db.getDocument(id);
    if (!doc) return res.status(404).json({ success: false, error: 'not found' });
    const fields = await db.getFields(id);
    res.json({ success: true, document: doc, fields });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'db error' });
  }
});

app.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: 'no file uploaded' });
    const filepath = req.file.path;
    const filename = req.file.originalname;
    const id = uuidv4();

    let blobUrl = filepath;
    // Upload to Azure Blob if connection string is provided
    if (process.env.AZURE_STORAGE_CONNECTION_STRING) {
      try {
        const remoteUrl = await azureBlob.uploadLocalFile(filepath, req.file.filename || path.basename(filepath));
        blobUrl = remoteUrl;
      } catch (err) {
        console.error('Azure blob upload failed', err);
        // continue and use local path
      }
    }

    await db.insertDocument({ id, filename, blob_url: blobUrl, status: 'processing' });

    // analyze (azure or mock)
    const analysis = await analyzer.analyze(blobUrl, filepath);

    // save fields
    await db.saveExtractedFields(id, analysis.fields || []);
    await db.updateDocumentStatus(id, 'processed', analysis.documentType || null, analysis.confidence || null);

    res.json({ success: true, documentId: id, analysis });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'upload failed' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('Zen-AI-Fax backend listening on port', PORT);
});
