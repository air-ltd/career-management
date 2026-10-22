/**
 * The `.docx` exporter.
 *
 * The question that matters here is not "does it produce a blob" but "is it a
 * real Word document that opens" — a hand-rolled OOXML file that parses as a
 * ZIP and has the right content types is most of the way there and still wrong.
 *
 * So: build it, then read it back. A `.docx` is an OOXML package, which means a
 * ZIP whose `word/document.xml` contains the text and whose page setup matches
 * the print output.
 */

import { describe, expect, it } from 'vitest'
import { docxExporter } from './docx'
import { buildDocumentModel, PRESETS } from '../model'
import { defaultSettings } from '../envelope'
import { pageGeometry, wordPageSize } from '../page'
import {
  achievementRow,
  awardRow,
  educationRow,
  jobRow,
  profileRow,
  questionCategoryRow,
  questionRow,
} from '../../test/factories'

/**
 * Build a model from a loose input.
 *
 * The cast is once, here. The factories return full valid records and every
 * table is empty unless a test names it, so the compiler has nothing to add —
 * but it will check, and produce the same error a hundred times to assert a
 * guarantee the factories already give.
 */
type LooseInput = { [K in keyof Parameters<typeof buildDocumentModel>[0]]: unknown }

function baseInput(): Partial<LooseInput> {
  return {
    options: PRESETS['cv'].options,
    settings: defaultSettings(new Date(0)),
    profiles: [],
    jobs: [],
    achievements: [],
    awards: [],
    education: [],
    questionCategories: [],
    questions: [],
  }
}

function model(overrides: Partial<LooseInput> = {}) {
  return buildDocumentModel({
    ...baseInput(),
    ...overrides,
  } as Parameters<typeof buildDocumentModel>[0])
}

async function build(theModel = sampleModel()) {
  return docxExporter.build(theModel)
}

function sampleModel() {
  return model({
    settings: { ...defaultSettings(new Date(0)), activeProfileId: 'p1' },
    profiles: [profileRow('p1', { title: 'Senior Engineer', email: 'a@b.c' })],
    jobs: [
      jobRow('j1', {
        startDate: '2020-01-01',
        endDate: '2024-03-31',
        company: 'Acme',
        jobTitle: 'Engineer',
        responsibilities: 'Did things',
      }),
    ],
    achievements: [achievementRow('a1', { jobId: 'j1', achievement: 'Shipped it' })],
    awards: [awardRow('aw1', { year: 2024, institution: 'Body', what: ' Prize' })],
    education: [educationRow('e1', { year: 2016, institution: 'Uni', what: 'Degree' })],
  })
}

/** Read a named entry out of a `.docx`, which is a ZIP. */
async function entry(blob: Blob, name: string): Promise<string> {
  const buffer = Buffer.from(await blob.arrayBuffer())
  // Local file header signature.
  const signature = 0x04034b50

  for (let offset = 0; offset + 30 < buffer.length; offset += 1) {
    if (buffer.readUInt32LE(offset) !== signature) continue

    const nameLength = buffer.readUInt16LE(offset + 26)
    const extraLength = buffer.readUInt16LE(offset + 28)
    const method = buffer.readUInt16LE(offset + 8)
    const compressedSize = buffer.readUInt32LE(offset + 18)

    const entryName = buffer.subarray(offset + 30, offset + 30 + nameLength).toString('utf8')
    if (entryName !== name) {
      offset += 30 + nameLength + extraLength + compressedSize - 1
      continue
    }

    const dataStart = offset + 30 + nameLength + extraLength
    const raw = buffer.subarray(dataStart, dataStart + compressedSize)

    if (method === 0) return raw.toString('utf8')
    // Deflate. `zlib.inflateSync` expects a zlib wrapper; a ZIP entry is raw
    // deflate, hence `inflateRawSync`.
    const { inflateRawSync } = await import('node:zlib')
    return inflateRawSync(raw).toString('utf8')
  }

  throw new Error(`${name} is not in the package`)
}

describe('docxExporter', () => {
  it('is registered with a .docx extension and a Word media type', () => {
    expect(docxExporter.id).toBe('docx')
    expect(docxExporter.fileExtension).toBe('.docx')
    expect(docxExporter.mediaType).toContain('wordprocessingml')
  })

  it('produces a ZIP, which is what an OOXML package is', async () => {
    const bytes = Buffer.from(await (await build()).arrayBuffer())
    // "PK" is the local file header signature. A non-ZIP file here means the
    // library produced something other than a Word document.
    expect(bytes.subarray(0, 2).toString('latin1')).toBe('PK')
  })

  it('contains document.xml with the profile title as the document title', async () => {
    const xml = await entry(await build(), 'word/document.xml')
    expect(xml).toContain('Senior Engineer')
  })

  it('contains the company and the job title', async () => {
    const xml = await entry(await build(), 'word/document.xml')
    expect(xml).toContain('Acme')
    expect(xml).toContain('Engineer')
  })

  it('contains the achievement', async () => {
    const xml = await entry(await build(), 'word/document.xml')
    expect(xml).toContain('Shipped it')
  })

  it('abbreviates September to three letters in the job heading', async () => {
    /*
     * The exporter used to format the month itself, through `Intl`, which renders
     * September as "Sept". It now shares the on-screen formatter, so the two agree —
     * and the job heading is where the date is read.
     */
    const theModel = model({
      jobs: [
        jobRow('j1', {
          startDate: '2024-09-01',
          endDate: null,
          company: 'Acme',
          jobTitle: 'Engineer',
        }),
      ],
    })
    const xml = await entry(await build(theModel), 'word/document.xml')
    expect(xml).toContain('Sep 2024')
    expect(xml).not.toContain('Sept')
  })

  it('contains both the award and the education entry in the combined table (D16)', async () => {
    const xml = await entry(await build(), 'word/document.xml')
    expect(xml).toContain('Prize')
    expect(xml).toContain('Degree')
  })

  it('omits stories from the CV preset', async () => {
    const theModel = model({
      ...baseInput(),
      options: PRESETS['cv'].options,
      jobs: [jobRow('j1', { story: 'a long story' })],
    })
    const xml = await entry(await docxExporter.build(theModel), 'word/document.xml')
    expect(xml).not.toContain('a long story')
  })

  it('includes stories in the interview preset', async () => {
    const theModel = model({
      ...baseInput(),
      options: PRESETS['interview'].options,
      jobs: [jobRow('j1', { story: 'a long story' })],
    })
    const xml = await entry(await docxExporter.build(theModel), 'word/document.xml')
    expect(xml).toContain('a long story')
  })

  it("includes an achievement's own story, when the stories are included", async () => {
    /*
     * An achievement can carry a story as well as the line itself — the long
     * version, for an interview. The story belongs to the achievement, so it
     * travels with it, indented under the bullet rather than floating loose.
     */
    const theModel = model({
      settings: { ...defaultSettings(new Date(0)), activeProfileId: 'p1' },
      profiles: [profileRow('p1', { title: 'Senior Engineer' })],
      jobs: [jobRow('j1', { company: 'Acme', jobTitle: 'Engineer' })],
      options: PRESETS['interview'].options,
      achievements: [
        achievementRow('a1', {
          jobId: 'j1',
          achievement: 'Shipped it',
          story: 'the achievement story',
        }),
      ],
    })
    const xml = await entry(await docxExporter.build(theModel), 'word/document.xml')
    expect(xml).toContain('the achievement story')
  })

  it('includes questions in the interview preset and not in the CV', async () => {
    const base = {
      ...baseInput(),
      questionCategories: [questionCategoryRow('c1', { title: 'Behavioural' })],
      questions: [
        questionRow('q1', { categoryId: 'c1', question: 'Why us?', answer: 'Because' }),
      ],
    }

    const interview = await entry(
      await docxExporter.build(model({ ...base, options: PRESETS['interview'].options })),
      'word/document.xml',
    )
    expect(interview).toContain('Why us?')
    expect(interview).toContain('Behavioural')

    const cv = await entry(
      await docxExporter.build(model({ ...base, options: PRESETS['cv'].options })),
      'word/document.xml',
    )
    expect(cv).not.toContain('Why us?')
  })

  it('sets Word page setup from the document settings (D44)', async () => {
    const theModel = model()
    const xml = await entry(await docxExporter.build(theModel), 'word/document.xml')

    const expected = wordPageSize(pageGeometry(theModel.settings.pageSize))
    // `w:pgSz` carries width and height in twips. Deriving the expectation from
    // the same geometry the exporter uses is the point: it catches the two
    // drifting apart, which is the actual risk.
    expect(xml).toContain(
      `w:w="${String(expected.size.width)}" w:h="${String(expected.size.height)}" w:orient="portrait"`,
    )
    // The margin too: Word defaults to 1 inch, so an export that left it alone
    // fitted a different measure than the print layout it came from.
    expect(xml).toContain(
      `w:top="${String(expected.margin.top)}" w:right="${String(expected.margin.right)}"`,
    )
  })

  it('scales the type size with the document setting', async () => {
    const base = baseInput()
    const small = model({
      ...base,
      settings: { ...defaultSettings(new Date(0)), fontSizePt: 8 },
      jobs: [jobRow('j1', { company: 'Acme', jobTitle: 'Engineer' })],
    })
    const large = model({
      ...base,
      settings: { ...defaultSettings(new Date(0)), fontSizePt: 14 },
      jobs: [jobRow('j1', { company: 'Acme', jobTitle: 'Engineer' })],
    })

    const smallXml = await entry(await docxExporter.build(small), 'word/document.xml')
    const largeXml = await entry(await docxExporter.build(large), 'word/document.xml')

    // `w:sz` is in half-points, so 8pt is 16 and 14pt is 28. The company name is
    // set at the job-heading size (fixed), so the date line is the body text —
    // the only run whose size tracks the document setting.
    expect(smallXml).toContain('<w:sz w:val="16"/>')
    expect(largeXml).toContain('<w:sz w:val="28"/>')
  })

  it('produces a heading level, so the document is navigable in Word (D48)', async () => {
    const xml = await entry(await build(), 'word/document.xml')
    expect(xml).toContain('w:val="Heading1"')
  })

  it('is deterministic: a second export produces the same document', async () => {
    const theModel = sampleModel()
    const first = await entry(await docxExporter.build(theModel), 'word/document.xml')
    const second = await entry(await docxExporter.build(theModel), 'word/document.xml')
    expect(second).toBe(first)
  })

  it('handles a document with no profile without throwing', async () => {
    const theModel = model()
    await expect(docxExporter.build(theModel)).resolves.toBeInstanceOf(Blob)
  })
})
