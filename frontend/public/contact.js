// Email de contacto de los textos legales: no está en el HTML en texto plano (los
// robots que recogen direcciones no lo encuentran); se muestra al pulsar el botón.
for (const el of document.querySelectorAll('[data-contact]')) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'btn';
  button.textContent = 'Mostrar email de contacto';
  button.addEventListener('click', () => {
    const email = atob(el.dataset.contact).split('').reverse().join('');
    const link = document.createElement('a');
    link.href = `mailto:${email}`;
    link.textContent = email;
    el.replaceChildren(link);
    link.focus();
  });
  el.replaceChildren(button);
}
