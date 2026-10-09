import { _electron as electron } from 'playwright-core'
import assert from 'node:assert/strict'
import { readFile, writeFile, mkdir, mkdtemp, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'
import { spawnSync } from 'node:child_process'

const pkg = JSON.parse(await readFile('package.json', 'utf8'))
const base = await mkdtemp(join(tmpdir(), 'bridge-installed-'))
const installedWindows = process.platform === 'win32' && !process.env.BRIDGE_TEST_EXECUTABLE
if (installedWindows) assert.equal(process.env.CI, 'true', 'Installed-app tests require a disposable CI runner')
const userData = installedWindows ? join(process.env.APPDATA, 'bridge') : join(base, 'profile')
const library = join(base, 'songs')
const installDir = join(base, 'app')
await mkdir(library, {recursive:true})
await mkdir(join(userData, 'bridge_data'), {recursive:true})
await mkdir('output/playwright', {recursive:true})
// Old single-folder settings are exercised on restart, after first-run setup.
await writeFile(join(userData, 'bridge_data/settings.json'), JSON.stringify({isSng:true, theme:'dark', chartFolderName:'{name}', volume:17}))
let executablePath = process.env.BRIDGE_TEST_EXECUTABLE
if (!executablePath) {
  assert.equal(process.platform, 'win32', 'Installer verification must run on Windows')
  const setup = resolve(`release/Bridge-RockList-Setup-${pkg.version}.exe`)
  const result = spawnSync(setup, ['/S', `/D=${installDir}`], {timeout:120000, encoding:'utf8'})
  assert.equal(result.status, 0, `NSIS install failed: ${result.stderr}`)
  executablePath = join(installDir,'Bridge.exe')
  const registration = spawnSync('reg.exe', ['query', 'HKCU\\Software\\Classes\\bridge\\shell\\open\\command', '/ve'], {encoding:'utf8'})
  assert.equal(registration.status,0)
  assert.ok(registration.stdout.toLowerCase().includes(executablePath.toLowerCase()), registration.stdout)
  const updates = await readFile(join(installDir,'resources/app-update.yml'),'utf8')
  assert.match(updates,/owner: Jamesllllllllll/)
  assert.match(updates,/repo: Bridge/)
  assert.ok((await readFile(join(installDir,'LICENSE.Bridge.txt'),'utf8')).includes('GNU GENERAL PUBLIC LICENSE'))
}
const hashes = ['a','b','c','d'].map(c => c.repeat(32))
const fixtureBytes = Array.from(Buffer.alloc(4096,42))
const errors = [], lookups = []
let app
async function launch(hash) {
  app = await electron.launch({executablePath, args:[...(installedWindows ? [] : [`--user-data-dir=${userData}`]), ...(hash ? [`bridge://chart/${hash}`] : [])], timeout:60000})
  await app.context().route('https://api.enchor.us/**', async route => {
    const request = route.request(), input = request.postDataJSON() ?? {}
    const md5 = input.hash
    if (md5) lookups.push(md5)
    const chart = {md5, chartId:hashes.indexOf(md5)+1, songId:null, groupId:1, versionGroupId:1, name:`Fixture-${md5?.[0]}`, artist:'Bridge test', charter:'Bridge test', album:null, genre:null, year:null, modifiedTime:'2026-01-01T00:00:00Z', hasVideoBackground:false, notesData:{effectiveLength:60000, trackHashes:[], noteCounts:{}, instruments:[]}, metadataIssues:[], folderIssues:[], chartIssues:[], diff_guitar:1, instrument:'guitar', charts:[], applicationUsername:'Test', applicationDriveId:'test', parentFolderId:'test', drivePath:'', internalPath:'', albumArtMd5:null}
    await route.fulfill({json:{data:hashes.includes(md5) ? [chart] : [], found:hashes.includes(md5) ? 1 : 0, page:1, out_of:1, search_time_ms:0}})
  })
  await app.context().route('https://clonehero.gitlab.io/**', route => route.fulfill({json:[]}))
  // Keep all downloaded bytes synthetic while exercising the real native queue,
  // filesystem checks, settings, file transfer, completion, and duplicate handling.
  await app.evaluate(({app,dialog}, {library,fixtureBytes,userData}) => {
    if (app.getPath('userData') !== userData) throw new Error(`Unexpected user data path: ${app.getPath('userData')}`)
    dialog.showOpenDialog = async () => ({canceled:false,filePaths:[library]})
    const https = require('node:https'), {PassThrough} = require('node:stream'), {EventEmitter} = require('node:events')
    const originalGet = https.get
    globalThis.__bridgeTestDownloads = []
    https.get = function(url, options, callback) {
      if (!String(url).startsWith('https://files.enchor.us/')) return originalGet.call(this,url,options,callback)
      if (!/^https:\/\/files\.enchor\.us\/[a-d]{32}\.sng$/.test(String(url))) throw new Error('Unexpected download URL')
      globalThis.__bridgeTestDownloads.push(String(url))
      const request = new EventEmitter()
      process.nextTick(() => {
        const response = new PassThrough()
        response.statusCode=200; response.headers={'content-length':String(fixtureBytes.length)}
        request.emit('response',response)
        process.nextTick(() => response.end(Buffer.from(fixtureBytes)))
      })
      return request
    }
  }, {library,fixtureBytes,userData})
  const page = await app.firstWindow()
  page.on('pageerror', err => errors.push(err.message))
  page.setDefaultTimeout(20000)
  return page
}
async function waitFile(letter) {
  const path = join(library,`Fixture-${letter}.sng`)
  const end=Date.now()+30000
  while(Date.now()<end) {
    try { assert.deepEqual([...await readFile(path)],fixtureBytes); return } catch {}
    await new Promise(resolve=>setTimeout(resolve,200))
  }
  throw new Error(`Download did not reach library: ${path}`)
}
async function openLink(hash) {
  // Exercise the OS protocol handler (Windows), not a renderer-only callback.
  if(process.platform==='win32' && !process.env.BRIDGE_TEST_EXECUTABLE) {
    const result = spawnSync('powershell.exe',['-NoProfile','-Command',`Start-Process 'bridge://chart/${hash}'`],{encoding:'utf8',timeout:15000})
    assert.equal(result.status,0,result.stderr)
  } else {
    spawnSync(executablePath,[`--user-data-dir=${userData}`,`bridge://chart/${hash}`],{timeout:15000})
  }
}
try {
  let page = await launch(hashes[0])
  await page.getByRole('status').filter({hasText:'Choose a library folder'}).waitFor()
  // A second startup/setup link must not replace the first pending link.
  await openLink(hashes[1])
  await page.getByRole('button',{name:'Add Library Folder',exact:true}).click()
  await waitFile('a'); await waitFile('b')
  assert.equal(await page.evaluate(async ()=>(await window.electron.invoke.getSettings()).volume),17)
  await openLink(hashes[2]); await waitFile('c')
  const before = await app.evaluate(()=>globalThis.__bridgeTestDownloads.length)
  await openLink(hashes[2])
  await page.getByRole('status').filter({hasText:'download queue'}).waitFor()
  assert.equal(await app.evaluate(()=>globalThis.__bridgeTestDownloads.length),before)
  await openLink('f'.repeat(32))
  await page.getByRole('status').filter({hasText:'unavailable'}).waitFor()
  await page.screenshot({path:'output/playwright/installed-bridge.png'})
  await app.close(); app=null
  // Old Bridge settings migration retains the folder, format, theme and volume.
  const settingsFile=join(userData,'bridge_data/settings.json')
  const settings=JSON.parse(await readFile(settingsFile,'utf8'))
  settings.libraryPath=library; delete settings.libraryFolders
  await writeFile(settingsFile,JSON.stringify(settings))
  page=await launch(hashes[3]); await waitFile('d')
  const migrated=await page.evaluate(()=>window.electron.invoke.getSettings())
  assert.equal(migrated.libraryFolders[0].path,library)
  assert.equal(migrated.isSng,true); assert.equal(migrated.volume,17)
  assert.deepEqual((await readdir(library)).sort(),['a','b','c','d'].map(c=>`Fixture-${c}.sng`))
  await writeFile('output/playwright/result.json',JSON.stringify({version:pkg.version,platform:process.platform,lookups,rendererErrors:errors,checks:['NSIS install and protocol registration','fork updater and license','cold start','first-run setup','multiple links','OS warm link','duplicate suppression','missing chart','legacy settings migration','native download to configured folder']},null,2))
  assert.deepEqual(errors,[])
  console.log('Installed Bridge checks passed')
} catch(error) {
  if(app) {
    try { const page=await app.firstWindow(); await page.screenshot({path:'output/playwright/failure.png'}); await writeFile('output/playwright/failure.txt',await page.locator('body').innerText()) } catch {}
  }
  throw error
} finally { if(app) await app.close() }
