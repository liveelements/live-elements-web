import liveElements from 'live-testspec/lib/vite-plugin-live-elements.mjs'

export default {
    plugins: [liveElements()],
    test: {
        environment: 'node',
        include: ['test/core/*.lv']
    }
}
