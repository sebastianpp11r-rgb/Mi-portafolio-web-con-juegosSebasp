document.addEventListener('DOMContentLoaded', () => {
  'use strict';

  // 1. Desplazamiento suave para enlaces con ancla (#)
  const enlacesAncla = document.querySelectorAll('a[href^="#"]:not([href="#"])');
  enlacesAncla.forEach(enlace => {
    enlace.addEventListener('click', (e) => {
      const destinoId = enlace.getAttribute('href');
      const elementoDestino = document.querySelector(destinoId);

      if (elementoDestino) {
        e.preventDefault();
        elementoDestino.scrollIntoView({
          behavior: 'smooth',
          block: 'start'
        });
      }
    });
  });

  // 2. Manejo y validación del Formulario de Contacto
  const formularioContacto = document.querySelector('.formulario-contenedor form');
  if (formularioContacto) {
    formularioContacto.addEventListener('submit', (e) => {
      e.preventDefault();

      const campoNombre = document.getElementById('nombre');
      const campoCorreo = document.getElementById('correo');

      if (!campoNombre.value.trim() || !campoCorreo.value.trim()) {
        alert('Por favor completa los campos obligatorios (Nombre y Correo electrónico).');
        return;
      }

      // Confirmación al usuario
      alert(`¡Gracias, ${campoNombre.value.trim()}! Tu mensaje se ha enviado correctamente. Te responderemos pronto a ${campoCorreo.value.trim()}.`);

      // Reiniciar formulario
      formularioContacto.reset();
    });
  }

  // 3. Actualización automática del año en el Footer
  const textoFooter = document.querySelector('.site-footer p');
  if (textoFooter) {
    const anioActual = new Date().getFullYear();
    textoFooter.textContent = `© ${anioActual} Sebastián. Portafolio personal.`;
  }
});