export function getPostBackgroundColors(
  bgColor?: string,
): [string, string] | null {
  if (!bgColor) return null;
  if (bgColor === "#1877F2") return ["#1877F2", "#4FACFE"];
  if (bgColor === "#E42C64") return ["#E42C64", "#FF758C"];
  if (bgColor === "#00A400") return ["#00A400", "#4ADE80"];
  if (bgColor === "#FF8C00") return ["#FF8C00", "#FACC15"];
  if (bgColor.includes("#ff0844")) return ["#FF0844", "#FFB199"];
  if (bgColor.includes("#1e3c72")) return ["#1E3C72", "#2A5298"];
  if (bgColor.includes("#fa709a")) return ["#FA709A", "#FEE140"];
  if (bgColor.includes("#667eea")) return ["#667EEA", "#764BA2"];
  if (bgColor.includes("#a18cd1")) return ["#A18CD1", "#FBC2EB"];
  if (bgColor.includes("#f83600")) return ["#F83600", "#F9D423"];
  if (bgColor.includes("#434343") || bgColor === "#242526")
    return ["#434343", "#000000"];
  return /^#[0-9a-f]{3,8}$/i.test(bgColor)
    ? [bgColor, bgColor]
    : ["#0A6652", "#113C32"];
}
