import { Component, effect, inject, signal, untracked } from '@angular/core'
import { Router, RouterOutlet } from '@angular/router'
import { firstValueFrom } from 'rxjs'
import { ChartLinkQueue } from '../../src-shared/ChartLinkQueue'
import { ChartData } from '../../src-shared/interfaces/search.interface'
import { DownloadService } from './core/services/download.service'

import { ToolbarComponent } from './components/toolbar/toolbar.component'
import { SearchService } from './core/services/search.service'
import { SettingsService } from './core/services/settings.service'

@Component({
	selector: 'app-root',
	standalone: true,
	imports: [RouterOutlet, ToolbarComponent],
	templateUrl: './app.component.html',
	styles: [],
})
export class AppComponent {
	private settingsService = inject(SettingsService)
	private searchService = inject(SearchService)
	private router = inject(Router)

	settingsLoaded = signal(false)
	private downloadService = inject(DownloadService)
	linkMessage = signal('')
	retryHash = signal<string | null>(null)
	private linkedCharts = new ChartLinkQueue<ChartData>({
		ready: () => this.settingsLoaded() && Boolean(this.settingsService.defaultLibraryPath),
		resolve: async hash => {
			await this.router.navigate(['/browse'])
			return (await firstValueFrom(this.searchService.searchByHash(hash))).data
		},
		download: chart => this.downloadService.addDownload(chart),
		status: (message, retryHash) => {
			this.linkMessage.set(message)
			this.retryHash.set(retryHash ?? null)
		},
	})

	constructor() {
		window.electron.on.chartDeepLink(hash => this.acceptChartLink(hash))
		effect(() => {
			if (this.settingsLoaded() && this.settingsService.defaultLibraryPath) {
				untracked(() => { void this.linkedCharts.drain() })
			}
		})

		this.settingsService.loadSettings().then(async () => {
			// Subscribe before draining the main-process startup queue.
			this.settingsLoaded.set(true)
			const initialLinks = await window.electron.invoke.getPendingChartDeepLink()
			for (const hash of initialLinks) this.acceptChartLink(hash)
			if (!initialLinks.length && !this.linkMessage()) {
				this.searchService.search().subscribe()
			}
			void this.linkedCharts.drain()
		}).catch(err => console.error('Failed to load settings:', err))

		document.addEventListener('keydown', event => {
			if (event.ctrlKey && (event.key === '+' || event.key === '-' || event.key === '=' || event.key === '0')) {
				event.preventDefault()
				if (event.key === '+' || event.key === '=') {
					this.settingsService.zoomIn()
				} else if (event.key === '-') {
					this.settingsService.zoomOut()
				} else {
					this.settingsService.zoomFactor = 1
				}
			}
		})

		document.addEventListener('wheel', event => {
			if (event.ctrlKey && event.deltaY !== 0) {
				if (event.deltaY > 0) {
					this.settingsService.zoomOut()
				} else {
					this.settingsService.zoomIn()
				}
			}
		})
	}

	private acceptChartLink(hash: string) {
		this.linkedCharts.add(hash)
		if (this.settingsLoaded() && !this.settingsService.defaultLibraryPath) {
			this.linkMessage.set('Choose a library folder in Settings to start your linked downloads.')
			void this.router.navigate(['/settings'])
		}
		void this.linkedCharts.drain()
	}

	retryChartLink() {
		const hash = this.retryHash()
		if (hash) this.acceptChartLink(hash)
	}
}
