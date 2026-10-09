/** Serializes exact-chart links without losing links during startup or setup. */
export class ChartLinkQueue<T extends { md5: string }> {
	private pending = new Set<string>()
	private running = false

	private actions: {
		ready: () => boolean
		resolve: (hash: string) => Promise<T[]>
		download: (chart: T) => void
		status: (message: string, retryHash?: string) => void
	}

	constructor(actions: ChartLinkQueue<T>['actions']) {
		this.actions = actions
	}

	add(hash: string) {
		if (!/^[a-f0-9]{32}$/i.test(hash)) return
		this.pending.add(hash.toLowerCase())
	}

	async drain() {
		if (this.running || !this.actions.ready()) return
		this.running = true
		try {
			while (this.pending.size && this.actions.ready()) {
				const hash = this.pending.values().next().value!
				try {
					this.actions.status('Finding the linked chart…')
					const charts = await this.actions.resolve(hash)
					const chart = charts.find(candidate => candidate.md5.toLowerCase() === hash)
					if (chart) {
						this.actions.download(chart)
						this.actions.status('The linked chart is in your download queue.')
					} else {
						this.actions.status('The linked chart is unavailable. You can retry or search for another version.', hash)
					}
				} catch {
					this.actions.status('The linked chart could not be opened. Please retry.', hash)
				} finally {
					this.pending.delete(hash)
				}
			}
		} finally {
			this.running = false
		}
	}
}
