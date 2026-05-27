import PDFDocument from "pdfkit";
import type { GeneratedPaper } from "../types/assessment.js";

export function renderQuestionPaperPdf(paper: GeneratedPaper): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 44, size: "A4" });
    const chunks: Buffer[] = [];

    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("error", reject);
    doc.on("end", () => resolve(Buffer.concat(chunks)));

    doc.font("Helvetica-Bold").fontSize(18).text(paper.assignmentTitle, { align: "center" });
    doc.moveDown(0.4);
    doc
      .font("Helvetica")
      .fontSize(10)
      .text(`${paper.subject} | ${paper.grade} | Due ${paper.dueDate} | ${paper.totalMarks} marks`, {
        align: "center"
      });

    doc.moveDown(1);
    doc.font("Helvetica-Bold").fontSize(11).text("Student Information");
    doc.moveDown(0.5);
    drawLineField(doc, "Name");
    drawLineField(doc, "Roll Number");
    drawLineField(doc, "Section");

    paper.sections.forEach((section) => {
      ensureSpace(doc, 120);
      doc.moveDown(0.8);
      doc.font("Helvetica-Bold").fontSize(13).text(section.title);
      doc.font("Helvetica-Oblique").fontSize(9).fillColor("#555555").text(section.instruction);
      doc.fillColor("#111111").moveDown(0.4);

      section.questions.forEach((question, index) => {
        ensureSpace(doc, 72);
        doc.font("Helvetica-Bold").fontSize(10).text(`${index + 1}. `, { continued: true });
        doc.font("Helvetica").fontSize(10).text(question.text);
        if (question.type === "multiple-choice" && question.options?.length) {
          question.options.forEach((option) => {
            ensureSpace(doc, 18);
            doc.font("Helvetica").fontSize(9).text(option, { indent: 16 });
          });
        }
        doc
          .font("Helvetica")
          .fontSize(8)
          .fillColor("#555555")
          .text(`${labelDifficulty(question.difficulty)} | ${question.marks} mark${question.marks > 1 ? "s" : ""}`, {
            indent: 16
          });
        doc.fillColor("#111111").moveDown(0.45);
      });
    });

    doc.end();
  });
}

function drawLineField(doc: PDFKit.PDFDocument, label: string) {
  const y = doc.y;
  doc.font("Helvetica").fontSize(10).text(`${label}:`, 44, y, { width: 88 });
  doc.moveTo(132, y + 10).lineTo(300, y + 10).strokeColor("#888888").stroke();
  doc.moveDown(0.7);
}

function ensureSpace(doc: PDFKit.PDFDocument, height: number) {
  const bottom = doc.page.height - doc.page.margins.bottom;
  if (doc.y + height > bottom) {
    doc.addPage();
  }
}

function labelDifficulty(value: string) {
  if (value === "medium") {
    return "Moderate";
  }
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function renderAnswerKeyPdf(paper: GeneratedPaper): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 44, size: "A4" });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("error", reject);
    doc.on("end", () => resolve(Buffer.concat(chunks)));

    doc.font("Helvetica-Bold").fontSize(18).text(`${paper.assignmentTitle} — Answer Key`, { align: "center" });
    doc.moveDown(0.4);
    doc
      .font("Helvetica")
      .fontSize(10)
      .text(`${paper.subject} | ${paper.grade} | ${paper.totalMarks} marks`, { align: "center" });
    doc.moveDown(1);

    paper.sections.forEach((section) => {
      ensureSpace(doc, 80);
      doc.font("Helvetica-Bold").fontSize(13).text(section.title);
      doc.moveDown(0.3);

      section.questions.forEach((question, index) => {
        ensureSpace(doc, 70);
        doc.font("Helvetica-Bold").fontSize(10).text(`${index + 1}. `, { continued: true });
        doc.font("Helvetica").fontSize(10).text(question.text);

        if (question.type === "multiple-choice") {
          const answer = (question.answer || "A").toUpperCase();
          (question.options || []).forEach((option) => {
            const letter = option.match(/^\s*([A-D])/i)?.[1]?.toUpperCase() ?? "";
            const isCorrect = letter === answer;
            ensureSpace(doc, 16);
            doc
              .font(isCorrect ? "Helvetica-Bold" : "Helvetica")
              .fillColor(isCorrect ? "#0f6848" : "#111111")
              .fontSize(9)
              .text(`${isCorrect ? "✓ " : "  "}${option}`, { indent: 16 });
          });
          doc.fillColor("#111111");
          doc
            .font("Helvetica-Bold")
            .fontSize(9)
            .fillColor("#0f6848")
            .text(`Correct answer: ${answer}`, { indent: 16 });
          doc.fillColor("#111111");
        } else if (question.answer) {
          doc
            .font("Helvetica-Oblique")
            .fontSize(9)
            .fillColor("#475569")
            .text(`Model answer: ${question.answer}`, { indent: 16 });
          doc.fillColor("#111111");
        } else {
          doc
            .font("Helvetica-Oblique")
            .fontSize(9)
            .fillColor("#94a3b8")
            .text("Open-ended response — grade per rubric.", { indent: 16 });
          doc.fillColor("#111111");
        }

        doc
          .font("Helvetica")
          .fontSize(8)
          .fillColor("#555555")
          .text(`${labelDifficulty(question.difficulty)} | ${question.marks} mark${question.marks > 1 ? "s" : ""}`, {
            indent: 16
          });
        doc.fillColor("#111111").moveDown(0.4);
      });
    });

    doc.end();
  });
}
