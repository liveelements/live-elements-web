const p = document.createElement("p");
p.className = 'faded'
const text = document.createTextNode("There's also an external script included in this page which generates this text.");
p.appendChild(text);
document.body.appendChild(p)