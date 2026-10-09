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
  const registration = spawnSync('reg.exe', ['query', 'HKCR\\bridge\\shell\\open\\command', '/ve'], {encoding:'utf8'})
  await writeFile('output/playwright/registration.txt',registration.stdout+registration.stderr)
  assert.equal(registration.status,0,registration.stdout+registration.stderr)
  assert.ok(registration.stdout.toLowerCase().includes(executablePath.toLowerCase()), registration.stdout)
  const updates = await readFile(join(installDir,'resources/app-update.yml'),'utf8')
  assert.match(updates,/owner: Jamesllllllllll/)
  assert.match(updates,/repo: Bridge/)
  assert.ok((await readFile(join(installDir,'LICENSE.Bridge.txt'),'utf8')).includes('GNU GENERAL PUBLIC LICENSE'))
}
const hashes = ['a','b','c','d'].map(c => c.repeat(32))
const chartText = '[Song]\n{\n  Name = "Bridge fixture"\n  Resolution = 192\n}\n' + '\n'.repeat(4096)
function uint64(value) { const bytes=Buffer.alloc(8); bytes.writeBigUInt64LE(BigInt(value)); return bytes }
const filename=Buffer.from('notes.chart'), chartBytes=Buffer.from(chartText)
const baseHeader=Buffer.concat([Buffer.from('SNGPKG'),Buffer.from([1,0,0,0]),Buffer.alloc(16),uint64(8),uint64(0),uint64(8+1+filename.length+16),uint64(1),Buffer.from([filename.length]),filename,uint64(chartBytes.length)])
const headerLength=baseHeader.length+16
const fixtureBytes=[...Buffer.concat([baseHeader,uint64(headerLength),uint64(chartBytes.length),Buffer.from(chartBytes.map((byte,index)=>byte^(index%256)))])]
const errors = [], lookups = []
let app
async function launch(hash) {
  app = await electron.launch({executablePath, args:[...(installedWindows ? [] : [`--user-data-dir=${userData}`]), ...(hash ? [`bridge://chart/${hash}`] : [])], timeout:60000})
  await app.context().route('https://api.enchor.us/**', async route => {
    const request = route.request(), input = request.postDataJSON() ?? {}
    const md5 = input.hash
    if (md5) lookups.push(md5)
    const chart = {md5, chartId:hashes.indexOf(md5)+1, songId:null, groupId:1, versionGroupId:1, name:`Fixture-${md5?.[0]}`, artist:'Bridge test', charter:'Bridge test', album:null, genre:null, year:null, modifiedTime:'2026-01-01T00:00:00Z', hasVideoBackground:false, notesData:{effectiveLength:60000, trackHashes:[], noteCounts:[], maxNps:[], chartIssues:[], instruments:[]}, metadataIssues:[], folderIssues:[], chartIssues:[], diff_guitar:1, instrument:'guitar', charts:[], applicationUsername:'Test', applicationDriveId:'test', parentFolderId:'test', drivePath:'', internalPath:'', albumArtMd5:null}
    await route.fulfill({json:{data:hashes.includes(md5) ? [chart] : [], found:hashes.includes(md5) ? 1 : 0, page:1, out_of:1, search_time_ms:0}})
  })
  await app.context().route('https://clonehero.gitlab.io/**', route => route.fulfill({json:[]}))
  // Keep all downloaded bytes synthetic while exercising the real native queue,
  // filesystem checks, settings, file transfer, completion, and duplicate handling.
  await app.evaluate(({app,dialog,BrowserWindow}, {library,fixtureBytes,userData}) => {
    globalThis.__bridgeLinkEvents=[]
    app.on('second-instance',(_,args)=>globalThis.__bridgeLinkEvents.push({type:'second-instance',args}))
    BrowserWindow.getAllWindows()[0]?.webContents.on('did-start-navigation',(_,url,inPlace)=>globalThis.__bridgeLinkEvents.push({type:'navigation',url,inPlace}))
    if (app.getPath('userData') !== userData) throw new Error(`Unexpected user data path: ${app.getPath('userData')}`)
    dialog.showOpenDialog = async () => ({canceled:false,filePaths:[library]})
    const https = process.getBuiltinModule('node:https'), {PassThrough} = process.getBuiltinModule('node:stream'), {EventEmitter} = process.getBuiltinModule('node:events')
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
async function waitFile(letter, folder=false) {
  const path = folder ? join(library,`Fixture-${letter}`,'notes.chart') : join(library,`Fixture-${letter}.sng`)
  const end=Date.now()+30000
  while(Date.now()<end) {
    try { assert.deepEqual([...await readFile(path)],folder ? [...chartBytes] : fixtureBytes); return } catch {}
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
    const result=spawnSync(executablePath,['--no-sandbox',`--user-data-dir=${userData}`,`bridge://chart/${hash}`],{timeout:15000,encoding:'utf8'})
    assert.equal(result.status,0,result.stderr)
  }
}
try {
  let page = await launch(hashes[0])
  await page.getByRole('status').filter({hasText:'Choose a library folder'}).waitFor()
  // A second startup/setup link must not replace the first pending link.
  await openLink(hashes[1])
  await page.getByRole('button',{name:/Add Library Folder/}).click()
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
  settings.libraryPath=library; settings.isSng=false; delete settings.libraryFolders
  await writeFile(settingsFile,JSON.stringify(settings))
  page=await launch(hashes[3]); await waitFile('d',true)
  assert.match(await readFile(join(library,'Fixture-d/song.ini'),'utf8'),/\[song\]/)
  const migrated=await page.evaluate(()=>window.electron.invoke.getSettings())
  assert.equal(migrated.libraryFolders[0].path,library)
  assert.equal(migrated.isSng,false); assert.equal(migrated.volume,17)
  assert.deepEqual((await readdir(library)).sort(),['Fixture-a.sng','Fixture-b.sng','Fixture-c.sng','Fixture-d'])
  await writeFile('output/playwright/result.json',JSON.stringify({version:pkg.version,platform:process.platform,lookups,rendererErrors:errors,checks:['NSIS install and protocol registration','fork updater and license','cold start','first-run setup','multiple links','OS warm link','duplicate suppression','missing chart','legacy settings migration','native SNG and extracted-folder downloads']},null,2))
  assert.deepEqual(errors,[])
  console.log('Installed Bridge checks passed')
} catch(error) {
  if(app) {
    console.error(JSON.stringify(await app.evaluate(()=>({events:globalThis.__bridgeLinkEvents,downloads:globalThis.__bridgeTestDownloads})),null,2))
    try { const page=await app.firstWindow(); await page.screenshot({path:'output/playwright/failure.png'}); await writeFile('output/playwright/failure.txt',await page.locator('body').innerText()) } catch {}
  }
  throw error
} finally { if(app) await app.close() }
