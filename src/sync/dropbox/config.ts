/**
 * Dropbox API configuration.
 *
 * Every Dropbox-specific fact in the application is in this file and in
 * `DropboxProvider.ts`. Nothing else imports a Dropbox URL.
 *
 * The wire shapes below were checked against the `dropbox/dropbox-api-spec`
 * documentation for `files.stone` rather than recalled, which is why the
 * asymmetries are as they are:
 *
 * 1. `upload` and `download` are both `host = "content"`, so both go to
 *    `content.dropboxapi.com`, and both accept `allow_app_folder_app = true`.
 * 2. `download` is `style = "download"` with a `DownloadArg` struct, so it is a
 *    **POST** with the arguments in the `Dropbox-API-Arg` header, not in the URL.
 * 3. `WriteMode` is a `union_closed`. Void members serialise as bare strings, and
 *    the one member that carries a value **must** carry its `.tag`.
 */

/** Least privilege, and nothing else (SY15). */
export const SCOPES = ['files.content.read', 'files.content.write'] as const

export const DROPBOX = {
  authorizeUrl: 'https://www.dropbox.com/oauth2/authorize',
  tokenUrl: 'https://api.dropboxapi.com/oauth2/token',
  uploadUrl: 'https://content.dropboxapi.com/2/files/upload',
  downloadUrl: 'https://content.dropboxapi.com/2/files/download',

  /**
   * Relative to the App Folder, so the real path is
   * `/apps/<app name>/career-management-document.json`.
   *
   * One file means one atomic unit: there is no cross-file consistency problem,
   * and a sync either lands whole or not at all.
   */
  defaultRemotePath: 'career-management-document.json',

  scopes: SCOPES,

  /**
   * The asymmetry here is load-bearing.
   *
   * `update` is the value-carrying member of a `union_closed`, so it is an
   * object and needs its `.tag`. `overwrite` is a void member, so it is a bare
   * string. Getting this wrong fails the write with an error that does not say
   * which half was wrong.
   */
  updateMode: (rev: string): Record<string, string> => ({ '.tag': 'update', update: rev }),
  overwriteMode: 'overwrite' as const,
} as const

/**
 * A revision mismatch against a file that has since been *deleted* must not pass
 * silently. For a sync file, "the file changed under me" is never acceptable.
 */
export const STRICT_CONFLICT = true

/**
 * Collapse leading slashes so an over-slashed path still addresses the intended
 * file rather than a differently-named one.
 *
 * The read/write path patterns include the leading slash, and omitting it draws
 * Dropbox's catch-all `other/` error, which says nothing useful.
 */
export function normalizePath(path: string): string {
  return `/${path.trim().replace(/^\/+/, '')}`
}
