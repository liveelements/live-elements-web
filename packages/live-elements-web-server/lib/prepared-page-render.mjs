export default class PreparedPageRender{

    constructor(htmlFragments){
        this._htmlFragments = htmlFragments
    }

    static create(html) {
        const lower = html.toLowerCase()

        const headCloseStart = lower.indexOf("</head>")
        const headCloseEnd = headCloseStart >= 0 ? headCloseStart + "</head>".length : -1

        const bodyOpenMatch = html.match(/<body\b[^>]*>/i)
        const bodyOpenStart = bodyOpenMatch ? bodyOpenMatch.index : -1
        const bodyOpenEnd = bodyOpenMatch ? bodyOpenStart + bodyOpenMatch[0].length : -1

        const bodyCloseStart = lower.indexOf("</body>")
        const bodyCloseEnd = bodyCloseStart >= 0 ? bodyCloseStart + "</body>".length : -1

        let f1
        if (headCloseEnd >= 0) {
            f1 = html.slice(0, headCloseEnd)
        } else if (bodyOpenStart >= 0) {
            f1 = html.slice(0, bodyOpenStart)
        } else {
            f1 = html
        }

        let f2 = ""
        if (bodyOpenEnd >= 0) {
            const start = f1.length
            f2 = html.slice(start, bodyOpenEnd)
        }

        let f3 = ""
        if (bodyCloseEnd >= 0 && bodyOpenEnd >= 0) {
            f3 = html.slice(f1.length + f2.length, bodyCloseEnd)
        }

        const f4 = html.slice(f1.length + f2.length + f3.length)
        return new PreparedPageRender([f1, f2, f3, f4])
    }

    render(headEnd, bodyStart, bodyEnd){
        const [f1, f2, f3, f4] = this._htmlFragments
        return `${f1}${headEnd}${f2}${bodyStart}${f3}${bodyEnd}${f4}`
    }
}