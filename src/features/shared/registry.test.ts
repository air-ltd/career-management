/**
 * The entity registry.
 *
 * The registry is the one place that says what a record is: its table, its
 * fields, its routes. A mistake in it is a mistake in every form, so the
 * properties that would lose somebody's work are checked here rather than
 * discovered in use.
 */

import { describe, expect, it } from 'vitest'
import { blankRecord, REGISTRY, tableOf, type RegistryKey } from './registry'
import { ENTITY_SCHEMAS, type EntityTableName } from '../../domain/types'

const KEYS = Object.keys(REGISTRY) as RegistryKey[]

describe('the registry', () => {
  it('covers every table that is edited through a form', () => {
    /*
     * A table in the envelope that the registry does not describe is a table
     * the app can read but not edit, and one the registry describes that the
     * envelope does not carry is a table whose records are lost on the next
     * sync.
     *
     * Two tables are deliberately not here: the settings, which is a singleton
     * rather than a record, and the templates, which are a named set of
     * settings rather than something a form edits. Anything else that turns up
     * in the envelope without a registry entry is a table the app cannot edit,
     * and this is where that would be noticed.
     */
    const notEdited = ['settings', 'templates']
    const described = KEYS.map((key) => REGISTRY[key].table).sort()
    const known = (Object.keys(ENTITY_SCHEMAS) as EntityTableName[])
      .filter((name) => !notEdited.includes(name))
      .sort()
    expect(described).toEqual(known)
  })

  it('gives every entity a table with a schema', () => {
    for (const key of KEYS) {
      expect(ENTITY_SCHEMAS[REGISTRY[key].table]).toBeDefined()
    }
  })

  it('names only fields the schema has, so a form cannot write a field that is dropped', () => {
    /*
     * A field the schema does not know is a field the form writes and the
     * envelope drops, which is a silent loss of what the user typed.
     */
    for (const key of KEYS) {
      const definition = REGISTRY[key]
      const schema = ENTITY_SCHEMAS[definition.table] as {
        shape?: Record<string, unknown>
      }
      const known = new Set(Object.keys(schema.shape ?? {}))
      for (const field of definition.fields({
        jobs: [],
        questionCategories: [],
        now: new Date(0),
      })) {
        expect(known.has(field.name)).toBe(true)
      }
    }
  })

  it('gives every entity a name, in the singular and the plural', () => {
    for (const key of KEYS) {
      const definition = REGISTRY[key]
      expect(definition.singular).not.toBe('')
      expect(definition.plural).not.toBe('')
    }
  })

  it('gives every entity a way to reach its own list, and its own form', () => {
    for (const key of KEYS) {
      const definition = REGISTRY[key]
      expect(definition.listPath.startsWith('/')).toBe(true)
      expect(definition.newPath?.startsWith('/')).toBe(true)
      expect(definition.editPath('an-id')).toContain('an-id')
    }
  })

  it('gives every entity a distinct table', () => {
    const tables = KEYS.map((key) => REGISTRY[key].table)
    expect(new Set(tables).size).toBe(tables.length)
  })
})

describe('the fields', () => {
  it('are all named, so a field with no name cannot be written', () => {
    for (const key of KEYS) {
      for (const field of REGISTRY[key].fields({
        jobs: [],
        questionCategories: [],
        now: new Date(0),
      })) {
        expect(field.name).not.toBe('')
        expect(field.label).not.toBe('')
      }
    }
  })

  it('include a checkbox only where the record has one', () => {
    /*
     * The hide-the-detail option is the only checkbox, and it is on the job
     * because the job is the thing that can be summarised. A checkbox on
     * anything else would be a field with no meaning behind it.
     */
    const checkboxes = (key: RegistryKey) =>
      REGISTRY[key]
        .fields({ jobs: [], questionCategories: [], now: new Date(0) })
        .filter((field) => field.kind === 'checkbox')
        .map((field) => field.name)
    expect(checkboxes('jobs')).toEqual(['hideDetail'])
    expect(checkboxes('achievements')).toEqual([])
    expect(checkboxes('questions')).toEqual([])
  })

  it('asks for the parent of a record that belongs to one', () => {
    expect(REGISTRY.achievements.parent?.column).toBe('jobId')
    expect(REGISTRY.questions.parent?.column).toBe('categoryId')
  })
})

describe('how a record is described', () => {
  const context = {
    jobs: [
      {
        id: 'j1',
        updatedAt: '1970-01-01T00:00:01.000Z',
        deletedAt: null,
        company: 'Acme',
        jobTitle: 'Engineer',
        startDate: '2020-01-01',
        endDate: null,
        responsibilities: '',
        story: '',
      },
    ],
    questionCategories: [
      {
        id: 'c1',
        updatedAt: '1970-01-01T00:00:01.000Z',
        deletedAt: null,
        title: 'Behavioural',
        story: '',
      },
    ],
    now: new Date(0),
  }

  it('names a profile by its name, and says who it is', () => {
    const described = REGISTRY.profiles.describe(
      {
        id: 'p1',
        updatedAt: '1970-01-01T00:00:01.000Z',
        deletedAt: null,
        name: 'Domestic',
        title: 'Engineer',
        email: 'me@example.com',
        address: '',
        phone: '',
      },
      context,
    )
    expect(described.heading).toBe('Domestic')
    expect(described.detail).toBe('me@example.com')
  })

  it('says a profile with no name is unnamed, rather than showing nothing', () => {
    const described = REGISTRY.profiles.describe(
      {
        id: 'p1',
        updatedAt: '1970-01-01T00:00:01.000Z',
        deletedAt: null,
        name: '',
        title: '',
        email: '',
        address: '',
        phone: '',
      },
      context,
    )
    expect(described.heading).toBe('(unnamed profile)')
  })

  it('names a role by its company and title, and gives its dates', () => {
    const described = REGISTRY.jobs.describe(
      {
        id: 'j1',
        updatedAt: '1970-01-01T00:00:01.000Z',
        deletedAt: null,
        company: 'Acme',
        jobTitle: 'Engineer',
        startDate: '2020-01-01',
        endDate: null,
        responsibilities: '',
        story: '',
      },
      context,
    )
    expect(described.heading).toBe('Acme - Engineer')
    expect(described.detail).toContain('2020')
  })

  it('names an achievement by its text, and says which role it belongs to', () => {
    const described = REGISTRY.achievements.describe(
      {
        id: 'a1',
        updatedAt: '1970-01-01T00:00:01.000Z',
        deletedAt: null,
        jobId: 'j1',
        achievement: 'Shipped it',
        story: '',
      },
      context,
    )
    expect(described.heading).toBe('Shipped it')
    expect(described.detail).toBe('Acme - Engineer')
  })

  it('says nothing about the role when the role is not there', () => {
    const described = REGISTRY.achievements.describe(
      {
        id: 'a1',
        updatedAt: '1970-01-01T00:00:01.000Z',
        deletedAt: null,
        jobId: 'missing',
        achievement: 'Shipped it',
        story: '',
      },
      context,
    )
    expect(described.detail).toBe('')
  })

  it('names an award and an education by their institution and year', () => {
    const row = {
      id: 'a1',
      updatedAt: '1970-01-01T00:00:01.000Z',
      deletedAt: null,
      year: 2024,
      institution: 'University',
      what: 'Degree',
      story: '',
    }
    expect(REGISTRY.awards.describe(row, context).heading).toBe('University')
    expect(REGISTRY.awards.describe(row, context).detail).toContain('2024')
    expect(REGISTRY.education.describe(row, context).heading).toBe('University')
  })

  it('names a question category by its title', () => {
    const described = REGISTRY.questionCategories.describe(
      {
        id: 'c1',
        updatedAt: '1970-01-01T00:00:01.000Z',
        deletedAt: null,
        title: 'Behavioural',
        story: '',
      },
      context,
    )
    expect(described.heading).toBe('Behavioural')
  })

  it('names a question by its text, and says which category it belongs to', () => {
    const described = REGISTRY.questions.describe(
      {
        id: 'q1',
        updatedAt: '1970-01-01T00:00:01.000Z',
        deletedAt: null,
        categoryId: 'c1',
        question: 'Why us?',
        answer: '',
      },
      context,
    )
    expect(described.heading).toBe('Why us?')
    expect(described.detail).toBe('Behavioural')
  })

  it('names a phrase by its text, and carries its note', () => {
    const described = REGISTRY.phrases.describe(
      {
        id: 'p1',
        updatedAt: '1970-01-01T00:00:01.000Z',
        deletedAt: null,
        text: 'Cut the billing page load time in half',
        note: 'For anything about speed',
      },
      context,
    )
    expect(described.heading).toBe('Cut the billing page load time in half')
    expect(described.detail).toBe('For anything about speed')
  })
})

describe('the options a form offers', () => {
  const jobs = [
    {
      id: 'j2',
      updatedAt: '1970-01-01T00:00:01.000Z',
      deletedAt: null,
      company: 'Beta',
      jobTitle: 'Lead',
      startDate: '2020-01-01',
      endDate: null,
      responsibilities: '',
      story: '',
    },
    {
      id: 'j1',
      updatedAt: '1970-01-01T00:00:01.000Z',
      deletedAt: null,
      company: 'Acme',
      jobTitle: 'Engineer',
      startDate: '2020-01-01',
      endDate: null,
      responsibilities: '',
      story: '',
    },
    {
      id: 'j3',
      updatedAt: '1970-01-01T00:00:01.000Z',
      deletedAt: '2024-01-01T00:00:00.000Z',
      company: 'Gone',
      jobTitle: 'Deleted',
      startDate: '2020-01-01',
      endDate: null,
      responsibilities: '',
      story: '',
    },
  ]
  const categories = [
    {
      id: 'c1',
      updatedAt: '1970-01-01T00:00:01.000Z',
      deletedAt: null,
      title: 'Behavioural',
      story: '',
    },
    {
      id: 'c2',
      updatedAt: '1970-01-01T00:00:01.000Z',
      deletedAt: '2024-01-01T00:00:00.000Z',
      title: 'Deleted',
      story: '',
    },
  ]

  it('offers the roles that are there, in alphabetical order, and not the ones that are not', () => {
    const options = REGISTRY.achievements
      .fields({ jobs, questionCategories: categories, now: new Date(0) })
      .find((field) => field.name === 'jobId')
    expect(options?.kind).toBe('select')
    const select = options as { options: { value: string; label: string }[] }
    expect(select.options.map((option) => option.label)).toEqual([
      'Acme - Engineer',
      'Beta - Lead',
    ])
  })

  it('offers the categories that are there, and not the ones that are not', () => {
    const options = REGISTRY.questions
      .fields({ jobs, questionCategories: categories, now: new Date(0) })
      .find((field) => field.name === 'categoryId')
    const select = options as { options: { value: string; label: string }[] }
    expect(select.options.map((option) => option.label)).toEqual(['Behavioural'])
  })
})

describe('a blank record', () => {
  it('is empty, and says so', () => {
    const record = blankRecord('profiles', new Date(0))
    expect(record['id']).toBe('')
    expect(record['deletedAt']).toBeNull()
  })

  it('starts an award in this year, and a role from today', () => {
    const now = new Date('2026-10-01T00:00:00.000Z')
    expect(blankRecord('awards', now)['year']).toBe(2026)
    expect(blankRecord('education', now)['year']).toBe(2026)
    expect(blankRecord('jobs', now)['startDate']).toBe('2026-10-01')
    expect(blankRecord('jobs', now)['endDate']).toBeNull()
  })
})

describe('the table for a key', () => {
  it('is the table the key means', () => {
    expect(tableOf('jobs').name).toBe('jobs')
    expect(tableOf('questionCategories').name).toBe('questionCategories')
  })
})

describe("a question's category", () => {
  /*
   * The category is a dropdown, and a dropdown that offers a category the user
   * has deleted offers them something that cannot be shown. A deleted category
   * is kept forever (D51), so "deleted" is not "gone" — it is hidden, and the
   * picker must not offer it.
   *
   * The list is alphabetical, because a category is a heading and not an event:
   * the order they were created in is not an order the user would choose.
   */
  it('offers the live categories, in alphabetical order', () => {
    const options = REGISTRY['questions'].fields({
      jobs: [],
      now: new Date(0),
      questionCategories: [
        {
          id: 'c1',
          title: 'Technical',
          story: '',
          updatedAt: '2026-01-01T00:00:00.000Z',
          deletedAt: null,
        },
        {
          id: 'c2',
          title: 'Behavioural',
          story: '',
          updatedAt: '2026-01-01T00:00:00.000Z',
          deletedAt: null,
        },
        {
          id: 'c3',
          title: 'Hidden',
          story: '',
          updatedAt: '2026-01-01T00:00:00.000Z',
          deletedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    })

    const category = options.find((field) => field.name === 'categoryId')
    expect(category?.kind).toBe('select')
    if (category?.kind !== 'select') return
    expect(category.options).toEqual([
      { value: 'c2', label: 'Behavioural' },
      { value: 'c1', label: 'Technical' },
    ])
  })
})
