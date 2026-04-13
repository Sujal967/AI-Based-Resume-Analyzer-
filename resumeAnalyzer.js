const SKILLS = require('./skillsTaxonomy')
const ROLE_PROFILES = require('./roleProfiles')

function normalizeText(t) {
  return String(t || '')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function tokenize(t) {
  return normalizeText(t)
    .toLowerCase()
    .replace(/[^a-z0-9+#.\n ]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
}

function countRegex(t, re) {
  const m = t.match(re)
  return m ? m.length : 0
}

function detectSections(t) {
  const lower = t.toLowerCase()
  const sections = []
  const has = (re) => re.test(lower)
  if (has(/\b(summary|professional summary|profile)\b/)) sections.push('Summary')
  if (has(/\b(experience|work experience|employment)\b/)) sections.push('Experience')
  if (has(/\b(projects?|personal projects?)\b/)) sections.push('Projects')
  if (has(/\b(education|academics?)\b/)) sections.push('Education')
  if (has(/\b(skills?|technical skills?)\b/)) sections.push('Skills')
  if (has(/\b(certifications?|certificates?)\b/)) sections.push('Certifications')
  if (has(/\b(achievements?|awards?)\b/)) sections.push('Achievements')
  if (has(/\b(publications?)\b/)) sections.push('Publications')
  return sections
}

function extractEmails(t) {
  const m = t.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi)
  return Array.from(new Set(m || []))
}

function extractLinks(t) {
  const m = t.match(/\bhttps?:\/\/[^\s)]+/gi)
  return Array.from(new Set(m || []))
}

function extractDates(t) {
  const m = t.match(/\b(20\d{2}|19\d{2})\b/g)
  return Array.from(new Set(m || []))
}

function extractBullets(t) {
  const lines = normalizeText(t).split('\n')
  return lines.filter((l) => /^\s*([-*•]|(\d+\.))\s+/.test(l)).map((l) => l.trim())
}

function toSkillRegex(skillName) {
  const s = skillName.toLowerCase()
  const escaped = s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const spaced = escaped.replace(/\s+/g, '\\s+')
  return new RegExp(`\\b${spaced}\\b`, 'i')
}

function extractSkills(text) {
  const raw = normalizeText(text)
  const lower = raw.toLowerCase()

  const skills = []
  for (const sk of SKILLS) {
    const re = toSkillRegex(sk.name)
    if (!re.test(lower)) continue

    const evidence = []
    const lines = raw.split('\n')
    for (const line of lines) {
      if (re.test(line)) evidence.push(line.trim())
      if (evidence.length >= 3) break
    }

    const confidence = Math.min(1, 0.55 + 0.15 * evidence.length)
    skills.push({ name: sk.name, category: sk.category, confidence, evidence })
  }

  skills.sort((a, b) => b.confidence - a.confidence || a.name.localeCompare(b.name))
  return skills
}

function buildKeywordSets(extractedSkills, targetProfile) {
  const present = extractedSkills.map((s) => s.name)
  const missing = []
  if (targetProfile?.mustHave?.length) {
    const presentSet = new Set(present.map((p) => p.toLowerCase()))
    for (const k of targetProfile.mustHave) {
      if (!presentSet.has(k.toLowerCase())) missing.push(k)
    }
  }
  return { present, missing }
}

function scoreResume(text, extractedSkills, sections, opts) {
  const t = normalizeText(text)
  const words = tokenize(t)
  const wordCount = words.length

  const breakdown = {
    sections: 0,
    contact: 0,
    impact: 0,
    skills: 0,
    clarity: 0,
    targeting: 0,
  }

  const secScore = Math.min(
    20,
    sections.length * 3 + (sections.includes('Experience') ? 4 : 0) + (sections.includes('Projects') ? 3 : 0),
  )
  breakdown.sections = secScore

  const emails = extractEmails(t).length
  const links = extractLinks(t).length
  breakdown.contact = Math.min(10, (emails ? 5 : 0) + Math.min(5, links * 2))

  const bullets = extractBullets(t)
  const bulletCount = bullets.length
  const nums = countRegex(t, /\b(\d{1,3}%|\d{1,3}\.\d+%|\d{1,4}x|\$?\d{1,3}(,\d{3})+|\b\d+\b)\b/g)
  const actionVerbs = countRegex(
    t.toLowerCase(),
    /\b(built|improved|reduced|increased|led|owned|designed|implemented|shipped|optimized|automated|delivered|launched|refactored|migrated|deployed|tested)\b/g,
  )
  breakdown.impact = Math.min(
    25,
    Math.round(Math.min(14, bulletCount) * 1.2 + Math.min(7, nums * 0.6) + Math.min(7, actionVerbs * 0.5)),
  )

  breakdown.skills = Math.min(20, Math.round(Math.min(18, extractedSkills.length) * 1.1))

  let clarity = 15
  if (wordCount < 250) clarity -= 5
  if (wordCount > 900) clarity -= 3
  if (countRegex(t, /\b(responsible for|worked on|helped with)\b/gi) > 2) clarity -= 3
  if (countRegex(t, /\n{4,}/g) > 0) clarity -= 2
  breakdown.clarity = Math.max(0, Math.min(15, clarity))

  const profile = ROLE_PROFILES[opts?.targetRole] || null
  if (profile) {
    const present = new Set(extractedSkills.map((s) => s.name.toLowerCase()))
    const must = profile.mustHave || []
    const nice = profile.niceToHave || []
    const mustHit = must.filter((k) => present.has(k.toLowerCase())).length
    const niceHit = nice.filter((k) => present.has(k.toLowerCase())).length
    breakdown.targeting = Math.min(
      10,
      must.length ? Math.round((mustHit / must.length) * 8 + Math.min(2, niceHit * 0.4)) : Math.min(10, niceHit),
    )
  } else {
    breakdown.targeting = 5
  }

  const resumeScore = Math.max(
    1,
    Math.min(
      100,
      breakdown.sections + breakdown.contact + breakdown.impact + breakdown.skills + breakdown.clarity + breakdown.targeting,
    ),
  )

  return { resumeScore, breakdown, wordCount }
}

function suggestionsFor(text, extractedSkills, sections, opts) {
  const t = normalizeText(text)
  const sugg = []
  const warnings = []
  const profile = ROLE_PROFILES[opts?.targetRole] || null

  const emails = extractEmails(t)
  const links = extractLinks(t)
  const bullets = extractBullets(t)
  const years = extractDates(t)
  const wordCount = tokenize(t).length

  if (!emails.length) {
    sugg.push({
      title: 'Add a clear contact header',
      impact: 'high',
      details: ['Add email + phone + location on the first line.', 'Include LinkedIn and GitHub/Portfolio links.'],
    })
  }

  if (links.length < 1) {
    sugg.push({
      title: 'Include proof links',
      impact: 'high',
      details: ['Add LinkedIn and at least one portfolio/GitHub link.', 'For projects, include repo/demo links where possible.'],
    })
  }

  if (!sections.includes('Experience')) {
    sugg.push({
      title: 'Add an Experience section',
      impact: 'high',
      details: ['Include role, company, dates, and 3–6 impact bullets per job.', 'Use action + metric + scope (what/why/how big).'],
    })
  }

  if (!sections.includes('Projects')) {
    sugg.push({
      title: 'Add 2–4 Projects with impact bullets',
      impact: 'high',
      details: ['Show what you built, tech used, and measurable results.', 'Add one “system design” style project if targeting software roles.'],
    })
  }

  if (bullets.length < 6) {
    sugg.push({
      title: 'Write more bullet points (impact-driven)',
      impact: 'high',
      details: [
        'Aim for 8–16 strong bullets across experience/projects.',
        'Each bullet: action verb + what you did + tools + result (metric).',
      ],
    })
  }

  const numCount = countRegex(t, /\b(\d{1,3}%|\d{1,3}\.\d+%|\d{1,4}x|\$?\d{1,3}(,\d{3})+|\b\d+\b)\b/g)
  if (numCount < 6) {
    sugg.push({
      title: 'Add more metrics',
      impact: 'high',
      details: [
        'Include metrics like latency, revenue, cost, adoption, throughput, or accuracy.',
        'Even estimates help: “reduced build time ~30%” or “served ~5k users/month”.',
      ],
    })
  }

  if (!sections.includes('Summary')) {
    sugg.push({
      title: 'Add a 2–3 line Summary tailored to the role',
      impact: 'medium',
      details: [
        'One line: role + years/domain.',
        'One line: strongest skills (aligned to target job).',
        'One line: biggest proof (metric, product, or achievement).',
      ],
    })
  }

  if (!sections.includes('Skills')) {
    sugg.push({
      title: 'Add a Skills section grouped by category',
      impact: 'medium',
      details: [
        'Group by: Languages, Frameworks, Databases, Cloud/DevOps, Tools.',
        'Avoid 50+ keywords with no evidence in bullets.',
      ],
    })
  }

  if (!sections.includes('Education')) {
    sugg.push({
      title: 'Add Education (even if brief)',
      impact: 'low',
      details: ['Degree, institution, year. Add relevant coursework only if it helps the role.'],
    })
  }

  if (years.length === 0 && sections.includes('Experience')) {
    warnings.push('Experience section found but dates not detected. Add month/year ranges (e.g., Jan 2023 – Mar 2025).')
  }

  if (wordCount > 950) {
    sugg.push({
      title: 'Trim to a tighter resume length',
      impact: 'medium',
      details: ['Most candidates should aim for 1 page (junior-mid) or 1–2 pages (senior).', 'Remove weak bullets and repeated tools.'],
    })
  }

  if (profile) {
    const present = new Set(extractedSkills.map((s) => s.name.toLowerCase()))
    const missing = (profile.mustHave || []).filter((k) => !present.has(k.toLowerCase()))
    if (missing.length) {
      sugg.push({
        title: `Close gaps for ${opts.targetRole}`,
        impact: 'high',
        details: [
          `Add evidence for: ${missing.slice(0, 8).join(', ')}${missing.length > 8 ? '…' : ''}.`,
          'Don’t just list skills—show them inside project/experience bullets.',
        ],
      })
    }
  }

  return { suggestions: sugg, warnings }
}

function jobSuggestions(extractedSkills, opts) {
  const roles = Object.entries(ROLE_PROFILES).map(([title, prof]) => ({ title, prof }))
  const present = new Set(extractedSkills.map((s) => s.name.toLowerCase()))

  const ranked = roles
    .map(({ title, prof }) => {
      const must = prof.mustHave || []
      const nice = prof.niceToHave || []
      const hitMust = must.filter((k) => present.has(k.toLowerCase())).length
      const hitNice = nice.filter((k) => present.has(k.toLowerCase())).length
      const mustScore = must.length ? hitMust / must.length : 0.5
      const niceScore = nice.length ? hitNice / nice.length : 0
      const fitScore = Math.round(Math.min(1, mustScore * 0.8 + niceScore * 0.2) * 100)

      const missingSkills = must.filter((k) => !present.has(k.toLowerCase())).slice(0, 10)
      const why = []
      if (hitMust) why.push(`Matches ${hitMust}/${must.length} core skills`)
      if (hitNice) why.push(`Has ${hitNice} nice-to-have skills`)
      if (opts?.location) why.push(`You prefer: ${opts.location}`)
      if (opts?.seniority) why.push(`Target: ${opts.seniority}`)

      return { title, fitScore, missingSkills, why }
    })
    .sort((a, b) => b.fitScore - a.fitScore || a.title.localeCompare(b.title))

  return ranked.slice(0, 8)
}

function analyzeResume(resumeText, opts = {}) {
  const text = normalizeText(resumeText)
  const sections = detectSections(text)
  const skillset = extractSkills(text)
  const { resumeScore, breakdown, wordCount } = scoreResume(text, skillset, sections, opts)
  const { suggestions, warnings } = suggestionsFor(text, skillset, sections, opts)
  const profile = ROLE_PROFILES[opts?.targetRole] || null
  const keywords = buildKeywordSets(skillset, profile)
  const jobSuggestionsOut = jobSuggestions(skillset, opts)

  return {
    resumeScore,
    scoreBreakdown: breakdown,
    skillset,
    suggestions,
    jobSuggestions: jobSuggestionsOut,
    keywords,
    meta: {
      wordCount,
      detectedSections: sections,
      warnings,
    },
  }
}

module.exports = { analyzeResume }

