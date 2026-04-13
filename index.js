const express = require('express')
const cors = require('cors')
const multer = require('multer')
const { z } = require('zod')
const mammoth = require('mammoth')

const { analyzeResume } = require('./resumeAnalyzer')

let PDFParseCached = null
async function getPDFParse() {
  if (PDFParseCached) return PDFParseCached
  // pdf-parse v2 exports a PDFParse class (ESM).
  const mod = await import('pdf-parse')
  const PDFParse = mod?.PDFParse
  if (typeof PDFParse !== 'function') throw new Error('PDF parser failed to load (pdf-parse import issue).')
  PDFParseCached = PDFParse
  return PDFParse
}

const app = express()
app.use(cors({ origin: true }))
app.use(express.json({ limit: '2mb' }))

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 6 * 1024 * 1024 },
})

app.get('/api/health', (_req, res) => res.json({ ok: true }))

app.post('/api/analyze', (req, res) => {
  const schema = z.object({
    resumeText: z.string().min(50),
    targetRole: z.string().optional(),
    seniority: z.enum(['intern', 'junior', 'mid', 'senior']).optional(),
    location: z.string().optional(),
  })

  const parsed = schema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).send(parsed.error.issues.map((i) => i.message).join('\n'))
  }

  const out = analyzeResume(parsed.data.resumeText, {
    targetRole: parsed.data.targetRole,
    seniority: parsed.data.seniority,
    location: parsed.data.location,
  })
  return res.json(out)
})

app.post('/api/analyze-file', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).send('Missing file')
  const targetRole = typeof req.body?.targetRole === 'string' ? req.body.targetRole : undefined
  const seniority = typeof req.body?.seniority === 'string' ? req.body.seniority : undefined
  const location = typeof req.body?.location === 'string' ? req.body.location : undefined

  const name = req.file.originalname.toLowerCase()
  const mime = (req.file.mimetype || '').toLowerCase()

  try {
    let text = ''

    if (name.endsWith('.pdf') || mime.includes('pdf')) {
      const PDFParse = await getPDFParse()
      const parser = new PDFParse({ data: req.file.buffer })
      try {
        const data = await parser.getText()
        text = data?.text || ''
      } finally {
        await parser.destroy().catch(() => {})
      }
    } else if (name.endsWith('.docx') || mime.includes('wordprocessingml')) {
      const data = await mammoth.extractRawText({ buffer: req.file.buffer })
      text = data.value || ''
    } else {
      return res.status(400).send('Unsupported file type. Upload a PDF or DOCX.')
    }

    if (text.trim().length < 50) {
      return res
        .status(400)
        .send('Could not extract enough text. Try exporting as a selectable-text PDF.')
    }

    const out = analyzeResume(text, { targetRole, seniority, location })
    return res.json(out)
  } catch (e) {
    return res.status(500).send(e instanceof Error ? e.message : 'Failed to analyze file')
  }
})

const PORT = process.env.PORT ? Number(process.env.PORT) : 8080
app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`API listening on http://localhost:${PORT}`)
})

