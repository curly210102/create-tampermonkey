#!/usr/bin/env node
// @ts-check

import fs from 'fs'
import path from 'path'

import minimist from 'minimist'
import prompts from 'prompts'
import { red, green, bold } from 'kolorist'

import renderTemplate from './utils/renderTemplate.js'
import { postOrderDirectoryTraverse, preOrderDirectoryTraverse } from './utils/directoryTraverse.js'
import generateReadme from './utils/generateReadme.js'
import getCommand from './utils/getCommand.js'
import deepMerge from './utils/deepMerge.js'

function isValidPackageName(projectName) {
  return /^(?:@[a-z0-9-*~][a-z0-9-*._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/.test(projectName)
}

function toValidPackageName(projectName) {
  return projectName
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/^[._]/, '')
    .replace(/[^a-z0-9-~]+/g, '-')
}

function canSafelyOverwrite(dir) {
  return !fs.existsSync(dir) || fs.readdirSync(dir).length === 0
}

function emptyDir(dir) {
  postOrderDirectoryTraverse(
    dir,
    (dir) => fs.rmdirSync(dir),
    (file) => fs.unlinkSync(file)
  )
}

async function init() {
  const cwd = process.cwd()
  // possible options:
  // --default
  // --typescript / --ts
  // --with-tests / --tests / --cypress
  // --lint
  // --force (for force overwriting)
  const argv = minimist(process.argv.slice(2), {
    alias: {
      typescript: ['ts'],
      'with-tests': ['tests', 'cypress']
    },
    // all arguments are treated as booleans
    boolean: true
  })

  // if any of the feature flags is set, we would skip the feature prompts
  // use `??` instead of `||` once we drop Node.js 12 support
  const isFeatureFlagsUsed =
    typeof (argv.default || argv.ts || argv.tests || argv.lint) === 'boolean'

  let targetDir = argv._[0]
  const defaultProjectName = !targetDir ? 'my-userscript' : targetDir

  const forceOverwrite = argv.force

  let result = {}

  try {
    // Prompts:
    // - Project name:
    //   - whether to overwrite the existing directory or not?
    //   - enter a valid package name for package.json
    // - Project language: JavaScript / TypeScript
    // - Add JSX Support?
    // - Install Vue Router for SPA development?
    // - Install Vuex for state management? (TODO)
    // - Add Cypress for testing?
    result = await prompts(
      [
        {
          name: 'projectName',
          type: targetDir ? null : 'text',
          message: 'Project name:',
          initial: defaultProjectName,
          onState: (state) => (targetDir = String(state.value).trim() || defaultProjectName)
        },
        {
          name: 'shouldOverwrite',
          type: () => (canSafelyOverwrite(targetDir) || forceOverwrite ? null : 'confirm'),
          message: () => {
            const dirForPrompt =
              targetDir === '.' ? 'Current directory' : `Target directory "${targetDir}"`

            return `${dirForPrompt} is not empty. Remove existing files and continue?`
          }
        },
        {
          name: 'overwriteChecker',
          type: (_prev, values = {}) => {
            if (values.shouldOverwrite === false) {
              throw new Error(red('✖') + ' Operation cancelled')
            }
            return null
          }
        },
        {
          name: 'packageName',
          type: () => (isValidPackageName(targetDir) ? null : 'text'),
          message: 'Package name:',
          initial: () => toValidPackageName(targetDir),
          validate: (dir) => isValidPackageName(dir) || 'Invalid package.json name'
        },
        {
          name: 'needsTypeScript',
          type: () => (isFeatureFlagsUsed ? null : 'toggle'),
          message: 'Add TypeScript?',
          initial: false,
          active: 'Yes',
          inactive: 'No'
        },
        {
          name: 'needsLinter',
          type: () => (isFeatureFlagsUsed ? null : 'toggle'),
          message: 'Add Linter & Formatter?',
          initial: false,
          active: 'Yes',
          inactive: 'No'
        }
        // {
        //   name: 'needsTests',
        //   type: () => (isFeatureFlagsUsed ? null : 'toggle'),
        //   message: 'Add Cypress for testing?',
        //   initial: false,
        //   active: 'Yes',
        //   inactive: 'No'
        // }
      ],
      {
        onCancel: () => {
          throw new Error(red('✖') + ' Operation cancelled')
        }
      }
    )
  } catch (cancelled) {
    console.log(cancelled.message)
    process.exit(1)
  }

  // `initial` won't take effect if the prompt type is null
  // so we still have to assign the default values here
  const {
    packageName = toValidPackageName(defaultProjectName),
    shouldOverwrite,
    needsTypeScript = argv.typescript,
    needsLinter = argv.lint,
    needsTests = argv.tests
  } = result
  const root = path.join(cwd, targetDir)

  if (shouldOverwrite) {
    emptyDir(root)
  } else if (!fs.existsSync(root)) {
    fs.mkdirSync(root)
  }

  console.log(`\nScaffolding project in ${root}...`)

  const pkg = { name: packageName, version: '0.0.0' }
  fs.writeFileSync(path.resolve(root, 'package.json'), JSON.stringify(pkg, null, 2))

  // todo:
  // work around the esbuild issue that `import.meta.url` cannot be correctly transpiled
  // when bundling for node and the format is cjs
  // const templateRoot = new URL('./template', import.meta.url).pathname
  const templateRoot = path.resolve(__dirname, 'template/vanilla')
  const render = async function render(templateName) {
    const templateDir = path.resolve(templateRoot, templateName)
    await renderTemplate(templateDir, root)
  }

  // Render base template
  await render('base')

  // Add configs.
  if (needsLinter) {
    await render('config/linter')
  }
  if (needsTests) {
    await render('config/cypress')
  }
  if (needsTypeScript) {
    await render('config/typescript')
  }

  // Render code template.
  // prettier-ignore
  // const codeTemplate =
  //   (needsTypeScript ? 'typescript-' : '') +
  //   ('default')
  // render(`code/${codeTemplate}`)

  // Render entry file (main.js/ts).
  // if (needsVuex && needsRouter) {
  //   render('entry/vuex-and-router')
  // } else if (needsVuex) {
  //   render('entry/vuex')
  // } else if (needsRouter) {
  //   render('entry/router')
  // } else {
  //   render('entry/default')
  // }

  // Cleanup.

  if (needsTypeScript) {
    // rename all `.js` files to `.ts`
    // rename jsconfig.json to tsconfig.json
    // replace rollup.config.js entry
    const rollupPath = path.join(root, "rollup.config.js");
    fs.writeFileSync(rollupPath, fs.readFileSync(rollupPath, {
      encoding: "utf-8"
    }).replace(/main\.js/g, "main.ts"));

    const srcPath = path.join(root, "src");
    preOrderDirectoryTraverse(
      root,
      () => {},
      (filepath) => {
        if (path.dirname(filepath) === srcPath && filepath.endsWith('.js')) {
          fs.renameSync(filepath, filepath.replace(/\.js$/, '.ts'))
        } else if (path.basename(filepath) === 'jsconfig.json') {
          const tsconfigJSON = path.resolve(filepath, "../tsconfig.json");

          if (fs.existsSync(tsconfigJSON)) {
            const jsconfig = JSON.parse(fs.readFileSync(filepath, {
              "encoding": "utf-8"
            }));
            const tsconfig = JSON.parse(fs.readFileSync(tsconfigJSON, {
              "encoding": "utf-8"
            }));
            fs.writeFileSync(tsconfigJSON, JSON.stringify(deepMerge(jsconfig, tsconfig), null, 2) + '\n');
            fs.unlinkSync(filepath);
          } else {
            fs.renameSync(filepath, filepath.replace(/jsconfig\.json$/, 'tsconfig.json'))
          }
        }
      }
    )
  }

  if (!needsTests) {
    // All templates assumes the need of tests.
    // If the user doesn't need it:
    // rm -rf cypress **/__tests__/
    preOrderDirectoryTraverse(
      root,
      (dirpath) => {
        const dirname = path.basename(dirpath)

        if (dirname === 'cypress' || dirname === '__tests__') {
          emptyDir(dirpath)
          fs.rmdirSync(dirpath)
        }
      },
      () => {}
    )
  }

  // Instructions:
  // Supported package managers: pnpm > yarn > npm
  // Note: until <https://github.com/pnpm/pnpm/issues/3505> is resolved,
  // it is not possible to tell if the command is called by `pnpm init`.
  const packageManager = /pnpm/.test(process.env.npm_execpath)
    ? 'pnpm'
    : /yarn/.test(process.env.npm_execpath)
    ? 'yarn'
    : 'npm'

  // README generation
  fs.writeFileSync(
    path.resolve(root, 'README.md'),
    generateReadme({
      projectName: result.projectName || defaultProjectName,
      packageManager,
      needsTypeScript,
      needsTests
    })
  )

  console.log(`\nDone. Now run:\n`)
  if (root !== cwd) {
    console.log(`  ${bold(green(`cd ${path.relative(cwd, root)}`))}`)
  }
  console.log(`  ${bold(green(getCommand(packageManager, 'install')))}`)
  console.log(`  ${bold(green(getCommand(packageManager, 'dev')))}`)
  console.log()
}

init().catch((e) => {
  console.error(e)
})
