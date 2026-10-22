import { describe, expect, it } from 'vitest'
import { overLongAchievements } from './FitReport'

/**
 * The achievements that run long are the ones the user is asked to rewrite, and
 * the report links each of them to its own edit page. The link is only useful
 * if it carries the achievement's id, so the id has to be read from the
 * attribute that holds it.
 *
 * `data-fit-achievement` is the marker that says "this is an achievement" and is
 * empty by design; `data-fit-achievement-id` carries the id. Reading the marker
 * instead gives an empty id, and the link becomes `#/achievements//edit`, which
 * goes nowhere.
 */
describe('the achievements that run long', () => {
  it('carries the id of the achievement, so the link reaches it', () => {
    const container = document.createElement('div')
    container.innerHTML = `
      <li data-fit-achievement="" data-fit-job="job-1" data-fit-achievement-id="short-1"
          style="height: 20px; line-height: 20px"></li>
      <li data-fit-achievement="" data-fit-job="job-1" data-fit-achievement-id="short-2"
          style="height: 20px; line-height: 20px"></li>
      <li data-fit-achievement="" data-fit-job="job-2" data-fit-achievement-id="the-long-one"
          style="height: 60px; line-height: 20px"></li>
    `

    const overLong = overLongAchievements(container)

    expect(overLong).toHaveLength(1)
    expect(overLong[0]?.achievementId).toBe('the-long-one')
    expect(overLong[0]?.jobId).toBe('job-2')
    expect(overLong[0]?.lines).toBe(3)
  })

  it('leaves the short ones out', () => {
    const container = document.createElement('div')
    container.innerHTML = `
      <li data-fit-achievement="" data-fit-job="job-1" data-fit-achievement-id="a"
          style="height: 20px; line-height: 20px"></li>
      <li data-fit-achievement="" data-fit-job="job-1" data-fit-achievement-id="b"
          style="height: 20px; line-height: 20px"></li>
    `

    expect(overLongAchievements(container)).toEqual([])
  })
})
