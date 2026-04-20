$(document).ready(function () {

  checkAuth();

  function checkAuth() {
    let token = localStorage.getItem("token");

    if (!token || token === "undefined" || token === "null") {
      localStorage.removeItem("token");
      window.location.href = "login.html";
      return;
    }
  }

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

  // -------------------------
  // spedizioni
  // -------------------------
  function richiestaTotoSpedizioni() {
    let request = inviaRichiesta('GET', '/api/totoSpedizioni');

    request
      .then((response) => {
        console.log(response);

        let righe = "";

        response.data.forEach(function (item) {

          righe += `
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
        });

        $("#tabellaPrincipale tbody").html(righe);
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

});