$(document).ready(function () {
  let datiGlobali = [];
  let paginaCorrente = 1;
  const righePerPagina = 10;

  checkAuth();

  function checkAuth() {
    let token = localStorage.getItem("token");

    if (!token || token === "undefined" || token === "null") {
      localStorage.removeItem("token");
      window.location.href = "login.html";
      return;
    }
  }

  $("#button-search").on("click", cercaDati);

  $("#inputCerca").on("keypress", function (e) {
    if (e.which === 13) {
      cercaDati();
    }
  });

  $("#btnContaRecord").on("click", function () {

    let totali = datiGlobali.length;

    let visualizzati = $("#tabellaPrincipale tbody tr").length;

    Swal.fire({
      icon: "info",
      title: "Conteggio record",
      html: `
      <b>Totali:</b> ${totali}<br>
      <b>Visualizzati (pagina corrente):</b> ${visualizzati}
    `
    });
  });

  $("#btnVisualizzaTutti").on("click", function () {

    // reset campo ricerca
    $("#inputCerca").val("");

    // ricarica tutti i dati dal DB
    richiestaTotoSpedizioni();

  });

  $('.dropdown').hover(
    function () {
      richiestaMomentanea();
      $(this).find('.dropdown-menu').addClass('show');
    },
    function () {
      $(this).find('.dropdown-menu').removeClass('show');
    }
  );

  richiestaMomentanea();
  richiestaTotoSpedizioni();

  $(document).on("click", ".btn-modifica", function () {

    let seriale = $(this).data("seriale");

    let row = $(this).closest("tr");

    let locazione = row.find("th").text();
    let articolo = row.find("td").eq(1).text();
    let note = row.find("td").eq(2).text();

    // riempio modal
    $("#editSeriale").val(seriale);
    $("#editLocazione").val(locazione);
    $("#editArticolo").val(articolo);
    $("#editNote").val(note);

    // apro popup
    $("#modalModificaSeriale").modal("show");
  });

  $("#btnExportCSV").on("click", function () {

    if (!datiGlobali || datiGlobali.length === 0) {
      Swal.fire({
        icon: "warning",
        title: "Nessun dato",
        text: "Non ci sono record da esportare"
      });
      return;
    }

    // intestazioni CSV
    let csv = "LOCAZIONE,SERIALE,ARTICOLO,NOTE\n";

    datiGlobali.forEach(item => {
      csv += `"${item.locazione || ""}",`;
      csv += `="${item.codice_seriale || ""}",`;
      csv += `"${item.articolo || ""}",`;
      csv += `"${item.note || ""}"\n`;
    });

    // crea file
    let blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    let url = URL.createObjectURL(blob);

    let a = document.createElement("a");
    a.href = url;
    a.download = "spedizioni.csv";
    a.click();

    URL.revokeObjectURL(url);
  });

  $("#btnBackupSpedizioni").on("click", function () {

    let request = inviaRichiesta("GET", "/api/backupSpedizioni");

    request.then((res) => {

      let jsonString = JSON.stringify(res.data, null, 2); // 👈 indentato

      let blob = new Blob([jsonString], { type: "text/plain;charset=utf-8;" });
      let url = URL.createObjectURL(blob);

      let a = document.createElement("a");
      a.href = url;
      a.download = "backup_spedizioni.txt";
      a.click();

      URL.revokeObjectURL(url);

    });

    request.catch(err => errore(err));
  });

  $("#btnSalvaModifica").on("click", function () {

    let data = {
      codice_seriale: $("#editSeriale").val(),
      locazione: $("#editLocazione").val(),
      note: $("#editNote").val()
    };

    let request = inviaRichiesta("POST", "/api/modificaSeriale", data);

    request.then(function (res) {
      $("#modalModificaSeriale").modal("hide");

      // aggiorna tabella
      richiestaTotoSpedizioni();
    });

    request.catch(function (err) {
      errore(err);
    });
  });

  // -------------------------
  // richiesta dati momentanei
  // -------------------------
  function richiestaMomentanea() {
    let request = inviaRichiesta('GET', '/api/momento');

    request
      .then((response) => {
        console.log(response);
      })
      .catch(function (err) {
        console.log(err.response?.status);

        if (err.response && err.response.status == 401) {
          console.log(err.response.data);
        } else {
          errore(err);
        }
      });
  }

  function cercaDati() {
    let testo = $("#inputCerca").val();

    let request = inviaRichiesta('GET', '/api/filtroCerca', {
      search: testo
    });

    request.then((response) => {
      datiGlobali = response.data;
      paginaCorrente = 1;

      renderTabella();
      renderPaginazione();
    });

    request.catch(err => errore(err));
  }

  // -------------------------
  // spedizioni
  // -------------------------
  function richiestaTotoSpedizioni() {
    let request = inviaRichiesta('GET', '/api/totoSpedizioni');

    request
      .then((response) => {
        console.log(response);

        datiGlobali = response.data;
        paginaCorrente = 1;

        renderTabella();
        renderPaginazione();
      })
      .catch(function (err) {
        console.log(err.response?.status);

        if (err.response && err.response.status == 401) {
          console.log(err.response.data);
        } else {
          errore(err);
        }
      });
  }

  $(document).on("click", ".btn-prev", function () {
    if (paginaCorrente > 1) {
      paginaCorrente--;
      renderTabella();
      renderPaginazione();
    }
  });

  $(document).on("click", ".btn-next", function () {
    let totalePagine = Math.ceil(datiGlobali.length / righePerPagina);

    if (paginaCorrente < totalePagine) {
      paginaCorrente++;
      renderTabella();
      renderPaginazione();
    }
  });

  function creaRiga(item) {
    return `
    <tr>
        <th scope="row">${item.locazione}</th>
        <td>${item.codice_seriale}</td>
        <td>${item.articolo}</td>
        <td>${item.note}</td>
        <td class="text-center align-middle">
            <button class="btn btn-modifica p-0 border-0 bg-transparent d-flex align-items-center justify-content-center mx-auto"
                    data-seriale="${item.codice_seriale}"
                    style="width: 40px; height: 40px;">
                <span style="font-size: 1.6rem; line-height: 1;">
                    ✏️
                </span>
            </button>
        </td>
    </tr>
  `;
  }

  function renderTabella() {
    let start = (paginaCorrente - 1) * righePerPagina;
    let end = start + righePerPagina;

    let datiPagina = datiGlobali.slice(start, end);

    let righe = datiPagina.map(creaRiga).join("");

    $("#tabellaPrincipale tbody").html(righe);
  }

  function renderPaginazione() {
    let totalePagine = Math.ceil(datiGlobali.length / righePerPagina);

    let html = `
    <div class="d-flex justify-content-center align-items-center gap-3">

      <button class="btn btn-sm btn-light btn-prev" ${paginaCorrente === 1 ? "disabled" : ""}>
        ←
      </button>

      <span>
        Pagina ${paginaCorrente} / ${totalePagine}
      </span>

      <button class="btn btn-sm btn-light btn-next" ${paginaCorrente === totalePagine ? "disabled" : ""}>
        →
      </button>

    </div>
  `;

    $("#paginazione").html(html);
  }

});

