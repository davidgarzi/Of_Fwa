//icone https://icons8.it/icon/set/meteo/fluency
//https://uiverse.io/
//https://newsapi.org/

//differenzio accessi di utenti
//fare tabelle iniziamo con i pop faccio elenco un pop per riga e al click mi fa vedere i
//dettagli del pop aprendo un div sotto con lista clienti pk le vlan le metto nella riga
//metto quidni pulsante dettagli e + sia per i pop che per i clienti

$(document).ready(function () {


  $('.dropdown').hover(
    function () {
      $(this).find('.dropdown-menu').addClass('show');
    },
    function () {
      $(this).find('.dropdown-menu').removeClass('show');
    }
  );

  richiestaMomentanea();

  //richiesta dati momentanei
  function richiestaMomentanea() {
    let request = inviaRichiesta('GET', '/api/momento');
    request.catch(function (err) {
      console.log(err.response.status)
      if (err.response.status == 401) {
        console.log(err.response.data);
      }
      else {
        errore(err);
      }
    });
    request.then((response) => {
      console.log(response);
    })
  }
});