import fs from 'fs'
import path from 'path'

import deepMerge from './deepMerge.js'
import sortDependencies from './sortDependencies.js'

/**
 * Renders a template folder/file to the file system,
 * by recursively copying all files under the `src` directory,
 * with the following exception:
 *   - `_filename` should be renamed to `.filename`
 *   - Fields in `package.json` should be recursively merged
 * @param {string} src source filename to copy
 * @param {string} dest destination filename of the copy operation
 */
async function renderTemplate(src, dest) {
  const stats = fs.statSync(src)

  if (stats.isDirectory()) {
    // if it's a directory, render its subdirectories and files recusively
    fs.mkdirSync(dest, { recursive: true })
    for (const file of fs.readdirSync(src)) {
      await renderTemplate(path.resolve(src, file), path.resolve(dest, file))
    }
    return
  }

  const filename = path.basename(src)

  if (filename === 'package.json' && fs.existsSync(dest)) {
    // merge instead of overwriting
    const existing = JSON.parse(fs.readFileSync(dest))
    const newPackage = JSON.parse(fs.readFileSync(src))
    const pkg = sortDependencies(deepMerge(existing, newPackage))
    fs.writeFileSync(dest, JSON.stringify(pkg, null, 2) + '\n')
    return
  }

  if (filename === 'rollup.config.js' && fs.existsSync(dest)) {
    dest = path.resolve(
      path.dirname(dest),
      'rollup_configs',
      `${path.basename(path.dirname(src))}.js`
    )
  }

  const dirname = path.basename(path.dirname(src))
  if (
    dirname === '.vscode' &&
    ['extensions.json', 'settings.json'].includes(filename) &&
    fs.existsSync(dest)
  ) {
    const existing = JSON.parse(fs.readFileSync(dest))
    const newConfig = JSON.parse(fs.readFileSync(src))
    const config = deepMerge(existing, newConfig)
    fs.writeFileSync(dest, JSON.stringify(config, null, 2) + '\n')
    return
  }

  if (filename.startsWith('_')) {
    // rename `_file` to `.file`
    dest = path.resolve(path.dirname(dest), filename.replace(/^_/, '.'))
  }

  fs.copyFileSync(src, dest)
}

export default renderTemplate
