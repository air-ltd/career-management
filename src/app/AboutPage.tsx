/**
 * The about page.
 *
 * The one page whose whole job is to say where the data is and who cannot see it.
 * That matters here more than in most apps: the document is a career, and the
 * question "does anyone but me have this" is the first one a user has a right to
 * have answered plainly. So the page states it in as few words as the claim needs
 * and does not dress it up.
 */

export function AboutPage() {
  return (
    <section className="about-page">
      <h2>About</h2>

      <div className="panel">
        <h3>Where your data lives</h3>
        <p>
          Everything you enter is stored in this browser, on this device. It is not sent to us,
          and we have no server that holds it. Clearing your browser's data removes your
          document from that browser, and there is nothing on our side to fall back on.
        </p>

        <h3>Syncing is optional</h3>
        <p>
          You can connect your own Dropbox account. When you do, a copy of the document is
          written to a private app folder in that account, so you can open it from another
          browser. The app asks only to read and write the files in that folder; it cannot see
          the rest of your Dropbox.
        </p>
        <p>
          Without sync, everything still works. This is a static page that runs in your browser,
          and it keeps working with the network off once it has loaded.
        </p>

        <h3>We do not have your data</h3>
        <p>
          There is no account, no sign-up and no analytics. We cannot read, and do not keep, the
          contents of your document. The only copy that could ever be seen by anyone else is the
          one in your own Dropbox, and that is there because you chose to put it there.
        </p>

        <h3>If you use the assistant</h3>
        <p>
          Drafting a line with an assistant sends your instruction and the line you are writing
          to the provider you chose, using a key of your own. That key is kept in this browser:
          it is never synced, never exported and never sent anywhere but the provider. The rest
          of your document is not sent — not the profile, not the jobs, not the other
          achievements.
        </p>
        <p>
          Nothing is sent unless you ask for a draft, and the panel is not offered at all until
          a key is set. If you would rather it sent nothing, leave the key unset: the feature is
          simply not there.
        </p>
      </div>
    </section>
  )
}
