import pptxgen from "pptxgenjs";

let pres = new pptxgen();
let slide = pres.addSlide();

// Slide Background
slide.background = { color: "FFFFFF" };

// Title
slide.addText("MARKET IMPACT & CORE BENEFITS", {
  x: 0,
  y: 0.3,
  w: "100%",
  h: 0.5,
  align: "center",
  fontSize: 24,
  bold: true,
  color: "0F172A",
});

// Center Nodes
slide.addShape(pres.ShapeType.ellipse, { x: 0.5, y: 2.2, w: 1.5, h: 1.5, fill: { color: "10B981" } });
slide.addText("MARKET\nIMPACT", { x: 0.5, y: 2.2, w: 1.5, h: 1.5, align: "center", fontSize: 14, bold: true, color: "FFFFFF" });

slide.addShape(pres.ShapeType.ellipse, { x: 8, y: 2.2, w: 1.5, h: 1.5, fill: { color: "F43F5E" } });
slide.addText("CORE\nBENEFITS", { x: 8, y: 2.2, w: 1.5, h: 1.5, align: "center", fontSize: 14, bold: true, color: "FFFFFF" });

// Connecting lines (Left)
slide.addShape(pres.ShapeType.line, { x: 2.0, y: 2.95, w: 1.0, h: -1.75, line: { color: "10B981", width: 2, endArrowType: "triangle" } });
slide.addShape(pres.ShapeType.line, { x: 2.0, y: 2.95, w: 1.0, h: -0.6, line: { color: "10B981", width: 2, endArrowType: "triangle" } });
slide.addShape(pres.ShapeType.line, { x: 2.0, y: 2.95, w: 1.0, h: 0.6, line: { color: "10B981", width: 2, endArrowType: "triangle" } });
slide.addShape(pres.ShapeType.line, { x: 2.0, y: 2.95, w: 1.0, h: 1.75, line: { color: "10B981", width: 2, endArrowType: "triangle" } });

// Connecting lines (Right)
slide.addShape(pres.ShapeType.line, { x: 8.0, y: 2.95, w: -1.0, h: -1.75, line: { color: "F43F5E", width: 2, endArrowType: "triangle" } });
slide.addShape(pres.ShapeType.line, { x: 8.0, y: 2.95, w: -1.0, h: -0.6, line: { color: "F43F5E", width: 2, endArrowType: "triangle" } });
slide.addShape(pres.ShapeType.line, { x: 8.0, y: 2.95, w: -1.0, h: 0.6, line: { color: "F43F5E", width: 2, endArrowType: "triangle" } });
slide.addShape(pres.ShapeType.line, { x: 8.0, y: 2.95, w: -1.0, h: 1.75, line: { color: "F43F5E", width: 2, endArrowType: "triangle" } });

// Left Cards
let yPositions = [0.8, 1.95, 3.1, 4.25];
let leftTexts = [
  { title: "🌱 Beginners", desc: "Turns any smartphone user into a confident, data-driven investor." },
  { title: "🛒 Retail Traders", desc: "Cures emotional trading by providing cold, mathematical AI logic." },
  { title: "🎓 Students", desc: "Demystifies the stock market without requiring expensive degrees." },
  { title: "🏦 Institutions", desc: "Delivers instant, tamper-proof logs for absolute compliance." }
];

for (let i = 0; i < 4; i++) {
  slide.addShape(pres.ShapeType.rect, { x: 3, y: yPositions[i], w: 2.8, h: 0.9, fill: { color: "FFFFFF" }, line: { color: "E2E8F0" } });
  slide.addText(leftTexts[i].title, { x: 3.1, y: yPositions[i] + 0.1, w: 2.6, h: 0.3, fontSize: 14, bold: true, color: "059669" });
  slide.addText(leftTexts[i].desc, { x: 3.1, y: yPositions[i] + 0.4, w: 2.6, h: 0.4, fontSize: 10, color: "475569" });
}

// Right Cards
let rightTexts = [
  { title: "Capital Safety 🛡️", desc: "Shield Mode actively blocks dangerous trades to save your money." },
  { title: "Psych Safety 🧠", desc: "Removes the stress and anxiety of risky, blind guessing." },
  { title: "Time Saving ⏱️", desc: "Condenses hours of stressful chart reading into a 2-second chat." },
  { title: "Accessibility 📱", desc: "Brings high-end financial AI directly to low-cost mobile phones." }
];

for (let i = 0; i < 4; i++) {
  slide.addShape(pres.ShapeType.rect, { x: 4.2, y: yPositions[i], w: 2.8, h: 0.9, fill: { color: "FFFFFF" }, line: { color: "E2E8F0" } });
  slide.addText(rightTexts[i].title, { x: 4.3, y: yPositions[i] + 0.1, w: 2.6, h: 0.3, fontSize: 14, bold: true, color: "E11D48", align: "right" });
  slide.addText(rightTexts[i].desc, { x: 4.3, y: yPositions[i] + 0.4, w: 2.6, h: 0.4, fontSize: 10, color: "475569", align: "right" });
}

pres.writeFile({ fileName: "../SIH_Slide_5.pptx" });
