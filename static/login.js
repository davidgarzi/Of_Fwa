$(document).ready(function () {
	let _username = $("#usr")
	let _password = $("#pwd")
	let _lblErrore = $("#lblErrore")

	_lblErrore.hide();

	$("#btnLogin").on("click", controllaLogin)

	$("#btnGoogle").on("click", loginGoogle)

	// il submit deve partire anche senza click 
	// con il solo tasto INVIO
	$(document).on('keydown', function (event) {
		if (event.keyCode == 13)
			controllaLogin();
	});

	function loginGoogle() {
		/*global google*/
		let file = require('fs');
		
		google.accounts.id.initialize({
			"client_id": OAUTH_CREDENTIALS.client_id,
			"callback": function (response) {
				if (response.credential !== "") {
					let token = response.credential
					console.log("token:", token)
					localStorage.setItem("token", token)
					/* window.location.href = "index.html" oppure */
					let request = inviaRichiesta("POST", "/api/googleLogin");
					request.then(function (response) {
						window.location.href = "index.html"
					});
					request.catch(errore);
				} else alert("Token non ricevuto")
			}
		})
		google.accounts.id.renderButton(
			document.getElementById("googleDiv"), // qualunque tag DIV della pagina
			{
				"theme": "outline",
				"size": "large",
				"type": "standard",
				"text": "continue_with",
				"shape": "rectangular",
				"logo_alignment": "center"
			}
		);
		google.accounts.id.prompt();
	}

	$("#btnRecuperaPassword").on("click", function () {
		let username = prompt("Inserisci la tua mail:");
		let password = prompt("Inserisci la tua password:");

		let request = inviaRichiesta("POST", "/api/cambiaPassword", { "username": username, "newPass": password });
		request.catch(errore);
		request.then((response) => {
			swal("Password cambiata con successo", "", "success");
		});
	})

	function controllaLogin() {
		_username.removeClass("is-invalid");
		_username.prev().removeClass("icona-rossa");
		_password.removeClass("is-invalid");
		_password.prev().removeClass("icona-rossa");

		_lblErrore.hide();

		if (_username.val() == "") {
			_username.addClass("is-invalid");
			_username.prev().addClass("icona-rossa");
		}
		else if (_password.val() == "") {
			_password.addClass("is-invalid");
			_password.prev().addClass("icona-rossa");
		}
		else {
			console.log("login" + _username.val() + _password.val());
			let request = inviaRichiesta('POST', '/api/login', { "username": _username.val(), "password": _password.val() });
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
				localStorage.setItem("username", _username.val());
				window.location.href = "index.html";
			})
		}
	}

	_lblErrore.children("button").on("click", function () {
		_lblErrore.hide();
	})
});