// Public legal texts (Web /privacidad and /terminos; Mobile opens these URLs). Plain language, voseo.
// Changing them changes what users accepted: update LEGAL_UPDATED and keep the previous meaning in git history.

export const LEGAL_CONTACT = "hola@ownlevel.fit";
export const LEGAL_OWNER = "Ignacio Senestrari";
export const LEGAL_UPDATED = "16 de octubre de 2026";

export type LegalSection = { title: string; paragraphs: string[]; items?: string[] };
export type LegalDocument = { title: string; intro: string; sections: LegalSection[] };

export const PRIVACY: LegalDocument = {
  title: "Política de privacidad",
  intro: `OWNLEVEL es una app para registrar tus entrenamientos, tu alimentación y tu cuerpo. Acá te contamos qué datos guardamos, para qué y qué podés hacer con ellos. El responsable es ${LEGAL_OWNER}, en Argentina. Para cualquier consulta escribinos a ${LEGAL_CONTACT}.`,
  sections: [
    {
      title: "Qué datos guardamos",
      paragraphs: ["Solo lo que hace falta para que la app funcione y lo que vos cargás:"],
      items: [
        "Tu cuenta: email, nombre y foto de perfil que da Google (o el proveedor con el que entres) y el nombre con el que querés que te llamemos.",
        "Entrenamiento: rutinas, ejercicios, sesiones, series, pesos y repeticiones.",
        "Alimentación: comidas, alimentos, comidas guardadas, tu plan nutricional y sus etapas.",
        "Cuerpo y métricas: peso, medidas, fecha de nacimiento, sexo, altura, nivel de actividad y las métricas diarias que elijas (agua, pasos, sueño y otras).",
        "Datos técnicos mínimos para que la app funcione y para detectar fallas, sin el contenido de lo que registrás.",
      ],
    },
    {
      title: "Para qué los usamos",
      paragraphs: [
        "Para mostrarte tu progreso, calcular tus objetivos y tu gasto estimado, y sincronizar la app con la Web. No vendemos tus datos, no mostramos publicidad y no te seguimos en otras apps ni sitios.",
        "Los cálculos (gasto, sugerencias de calorías, 1RM estimado) son orientativos y no reemplazan el consejo de un profesional de la salud.",
      ],
    },
    {
      title: "Con quién se comparten",
      paragraphs: ["Usamos proveedores que procesan los datos solo para darte el servicio:"],
      items: [
        "Supabase: base de datos y cuentas.",
        "Vercel: servidores de la Web y de la API. En la Web también mide visitas y rendimiento de forma agregada, sin cookies de seguimiento.",
        "Google: para entrar con tu cuenta de Google.",
        "Si conectás OWNLEVEL con ChatGPT, OpenAI accede solo a lo que autorices en esa conexión. La podés desconectar cuando quieras.",
      ],
    },
    {
      title: "Dónde se guardan",
      paragraphs: ["Los servidores de estos proveedores pueden estar fuera de Argentina. Tus datos viajan cifrados y cada cuenta solo puede leer los suyos."],
    },
    {
      title: "Cuánto tiempo",
      paragraphs: ["Mientras tengas la cuenta. Si la eliminás, se borra todo lo que registraste, en la app y en la Web, y no se puede recuperar."],
    },
    {
      title: "Tus derechos",
      paragraphs: [
        "Podés ver y corregir tus datos desde la app, y eliminar tu cuenta desde Ajustes › Cuenta › Eliminar cuenta. También podés pedirnos acceso, corrección o eliminación escribiendo a " + LEGAL_CONTACT + ".",
        "Si sentís que no respetamos tus derechos, podés acudir a la Agencia de Acceso a la Información Pública (Argentina), autoridad de control de la Ley 25.326.",
      ],
    },
    {
      title: "Menores",
      paragraphs: ["OWNLEVEL no está pensada para menores de 13 años."],
    },
    {
      title: "Cambios",
      paragraphs: ["Si cambiamos esta política, actualizamos la fecha y, si el cambio es importante, te avisamos en la app."],
    },
  ],
};

export const TERMS: LegalDocument = {
  title: "Términos y condiciones",
  intro: `Estos términos regulan el uso de OWNLEVEL (la app y la Web), de ${LEGAL_OWNER}, en Argentina. Al crear tu cuenta o seguir usándola, los aceptás.`,
  sections: [
    {
      title: "Tu cuenta",
      paragraphs: ["Entrás con un proveedor como Google. Cuidá el acceso a esa cuenta: lo que se haga con ella en OWNLEVEL queda a tu nombre. Podés eliminarla cuando quieras desde Ajustes."],
    },
    {
      title: "Lo que registrás es tuyo",
      paragraphs: ["Tus entrenamientos, comidas y medidas son tuyos. Nos das permiso para guardarlos y procesarlos solo para darte el servicio, como explica la Política de privacidad."],
    },
    {
      title: "No es consejo médico",
      paragraphs: [
        "OWNLEVEL te ayuda a registrar y entender tus datos. Los objetivos, estimaciones y sugerencias son orientativos y no reemplazan a un médico, nutricionista o entrenador.",
        "Antes de cambiar mucho tu alimentación o tu entrenamiento, o si tenés una condición de salud, consultá a un profesional.",
      ],
    },
    {
      title: "Uso razonable",
      paragraphs: ["No uses OWNLEVEL para dañar a otras personas o al servicio: nada de acceder a cuentas ajenas, saturar los servidores ni copiar el servicio de forma automatizada."],
    },
    {
      title: "Disponibilidad",
      paragraphs: ["Hacemos lo posible para que funcione siempre y no perder datos, pero puede haber cortes o errores. El servicio se ofrece tal como está, en la medida que lo permita la ley."],
    },
    {
      title: "Cambios y fin del servicio",
      paragraphs: ["Podemos cambiar la app o estos términos. Si el cambio es importante, te avisamos antes. Si algún día OWNLEVEL deja de funcionar, te vamos a avisar con tiempo."],
    },
    {
      title: "Ley aplicable",
      paragraphs: [`Se rigen por las leyes de la República Argentina. Para cualquier consulta, escribinos a ${LEGAL_CONTACT}.`],
    },
  ],
};
