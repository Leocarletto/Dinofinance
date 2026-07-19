// Finanças — configuração opcional do deploy (arquivo simples, sem build).
//
// Login Google: crie um OAuth Client ID (tipo "Aplicativo da Web") em
// https://console.cloud.google.com/apis/credentials, adicione a URL do site
// em "Origens JavaScript autorizadas" (ex.: https://usuario.github.io e, para
// testes, http://localhost:8899) e cole o ID abaixo. Deixe "" para desativar —
// cada pessoa ainda pode configurar o seu na tela de entrada.
window.FINANCAS_CONFIG = {
  googleClientId: "",   // ex.: "1234567890-abc123.apps.googleusercontent.com"
};
