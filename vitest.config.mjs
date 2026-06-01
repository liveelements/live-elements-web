import liveElements from 'live-elements-studio-server/vite/vite-plugin-live-elements.mjs'

export default {
    plugins: [liveElements()],
    test: {
        environment: 'node',
        include: ['test/core/*.lv']
    }
}
