import { save } from './app.js';

let downloadButton = document.getElementById("downloadButton");
downloadButton.addEventListener("click", generate);

function generate() {
    try {
        let data = transformData(save());
        fetch('http://localhost:8080/cadmium/generate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data),
        }).then((res) => {
            return res.text(); 
        }).then((text) => {
            let filename = document.getElementById("modalname").value + ".txt"; //Saving the data as the name of the modal the user inputted
            let blob = new Blob([text], { type: 'text/plain' }); // Creating a new blob which will store the data
            saveAs(blob, filename); // Saving the data in a text file
        }).catch((e) => console.error("Fetch error: ", e));
    } catch (e) { //Catch any errors
        console.error("Generate error: ", e);
    }
}

function transformData(data) {
    try {
        data = JSON.parse(data);
        let nodeData = data.nodeDataArray;
        let linkData = data.linkDataArray;
        let states = [];
        let model = [];
        let group_keys = [];

        nodeData.forEach(d => {
            if (d.hasOwnProperty("isGroup") && d.isGroup) {
                model.push(d);
                group_keys.push(d.key);
            } else {
                states.push(d);
            }
        });

        let request_body = {};
        let coupled = [];
        let atomics = [];
        let dataInputs = [];
        let coupled_id = {};
        let atomic_id = {};
        let data_id = {}; //Brand new data ID object literal (to store TCP Client and Pin-Out data)
        let model_dict = {};

        nodeData.forEach(d => {
            model_dict[d.key] = d;
        });

        nodeData.forEach(d => {
            if ((d.hasOwnProperty('group') && d.hasOwnProperty('isGroup')) || d.figure === "Rectangle" || d.figure === "Diamond" || d.figure === "Square" || d.figure === "Ellipse" || d.figure === "RoundedRectangle") { //Using node's physical shape as a charateristic to identify the location of it in the diagram
                if (coupled_id.hasOwnProperty(d.group)) {
                    coupled_id[d.group].push(d.key);
                } else {
                    coupled_id[d.group] = [d.key];
                }
            } else if (d.hasOwnProperty('group') && !d.hasOwnProperty('isGroup')) {
                if (atomic_id.hasOwnProperty(d.group)) {
                    atomic_id[d.group].push(d.key);
                } else {
                    atomic_id[d.group] = [d.key];
                }
            }
            // Looping specfically through Pin-Out (Square shape) or TCP Client (Ellipse shape) to store field inputs in 'Data'
            if (d.figure === "Square" || d.figure === "Ellipse") {
                if (data_id.hasOwnProperty(d.group)) {
                    data_id[d.group].push(d.key);
                } else {
                    data_id[d.group] = [d.key]; //Storing the info in Pin-Out and TCP Client in data object liteal
                }
            }
        });

        model.forEach(m => {
            if (coupled_id.hasOwnProperty(m.key)) {
                let coupled_obj = { name: m.text };

                let components = [];
                model.forEach(d => {
                    if (d.group === m.key) {
                        components.push(d.text);
                    }
                });
                //Given that each palette element has a unique shape, I used it as one of the filters
                if (states.filter(s => (s.figure == "Rectangle" && s.group == m.key)).length > 0)
                    components.push("IEStream");
                if (states.filter(s => (s.figure == "Diamond" && s.group == m.key)).length > 0)
                    components.push("Device");
                if (states.filter(s => (s.figure == "Square" && s.group == m.key)).length > 0)
                    components.push("Pin-Out");
                if (states.filter(s => (s.figure == "RoundedRectangle" && s.group == m.key)).length > 0)
                    components.push("Wrapper");
                if (states.filter(s => (s.figure == "Ellipse" && s.group == m.key)).length > 0)
                    components.push("TCP Client");
                coupled_obj['components'] = components;

                if (m.text === "top_model") {
                    coupled_obj.top = { name: m.text, out_port: m.O[0].text.split("\n")[0] };
                    request_body.top = { name: m.text, out_port: m.O[0].text.split("\n")[0] };
                }

                let links = linkData.filter(l => {
                    return l.color == 'red' &&
                        ((coupled_id[m.key].includes(l.from) && coupled_id[m.key].includes(l.to)) ||
                            (l.from == m.key && coupled_id[m.key].includes(l.to)) ||
                            (l.to == m.key && coupled_id[m.key].includes(l.from)));
                });

                let couplings = [];
                let inports = [], outports = [];
                m.I.forEach(d => {
                    let port = d.text.split("\n");
                    inports.push({ name: port[0], type: port[1] });
                });
                m.O.forEach(d => {
                    let port = d.text.split("\n");
                    outports.push({ name: port[0], type: port[1] });
                });
                links.forEach(l => {
                    let from_key = l.from;
                    let to_key = l.to;
                    let from_model = model_dict[from_key];
                    let to_model = model_dict[to_key];
                    let fname = from_model.text.split("\n")[0];
                    let tname = to_model.text.split("\n")[0];
                    let from_p, to_p;

                    if (fname === "IEStream" || fname === "Pin-Out" || fname === "TCP Client" || fname === "Wrapper" || fname === "Device")
                        from_p = 'out';
                    else {
                        from_model.O.forEach(ports => {
                            if (ports.id === l.fromPort)
                                from_p = ports.text.split("\n")[0];
                        });
                        if (from_p === undefined) {
                            from_model.I.forEach(ports => {
                                if (ports.id === l.fromPort)
                                    from_p = ports.text.split("\n")[0];
                            });
                            fname = "";
                        }
                    }
                    to_model.I.forEach(ports => {
                        if (ports.id === l.toPort)
                            to_p = ports.text.split("\n")[0];
                    });
                    if (to_p === undefined) {
                        to_model.O.forEach(ports => {
                            if (ports.id === l.toPort)
                                to_p = ports.text.split("\n")[0];
                        });
                        tname = "";
                    }
                    let coupling_obj = {
                        from_model: fname,
                        to_model: tname,
                        from_port: from_p,
                        to_port: to_p
                    };
                    couplings.push(coupling_obj);
                });
                coupled_obj.inports = inports;
                coupled_obj.outports = outports;
                coupled_obj.couplings = couplings;
                coupled.push(coupled_obj);
            }
        });

        for (let key of Object.keys(atomic_id)) {
            let curr_atomic = model_dict[key];
            let atomic_obj = { name: curr_atomic.text };
            let states = {};
            atomic_id[key].forEach(d => {
                let state_obj = model_dict[d];
                let sname = state_obj.text.split("\n");
                if (sname[0].charAt(0) === '*') {
                    sname[0] = sname[0].substring(1);
                    atomic_obj['initial_state'] = sname[0];
                    model_dict[d].text = sname[0] + "\n" + sname[1];
                }
                states[sname[0]] = sname[1].split("=")[1] == "inf" ? "inf" : parseInt(sname[1].split("=")[1]);
            });
            let inports = [], outports = [];
            curr_atomic.I.forEach(d => {
                let port = d.text.split("\n");
                inports.push({ name: port[0], type: port[1] });
            });
            curr_atomic.O.forEach(d => {
                let port = d.text.split("\n");
                outports.push({ name: port[0], type: port[1] });
            });
            atomic_obj['inports'] = inports;
            atomic_obj['outports'] = outports;
            atomic_obj['states'] = states;
            let internal = [], external = [], output = [];
            linkData.filter(d =>
                atomic_id[key].includes(d.from) || atomic_id[key].includes(d.to)
            ).forEach(d => {
                if (d.hasOwnProperty('dash_array')) {
                    let label = d.label.split("!");
                    internal.push({
                        curr_state: model_dict[d.from].text.split("\n")[0],
                        new_state: model_dict[d.to].text.split("\n")[0]
                    });
                    output.push({
                        curr_state: model_dict[d.from].text.split("\n")[0],
                        port: label[0],
                        value: label[1]
                    });
                } else {
                    let label = d.label.split("?");
                    external.push({
                        port: label[0],
                        value: label[1],
                        curr_state: model_dict[d.from].text.split("\n")[0],
                        new_state: model_dict[d.to].text.split("\n")[0]
                    });
                }
            });
            atomic_obj['internal_transitions'] = internal;
            atomic_obj['external_transitions'] = external;
            atomic_obj['output'] = output;
            atomics.push(atomic_obj);
        }

        // Collecting Pin-Out data from index.html IDs
        let pinNumberInput = document.getElementById("pinNumberInput");
        let rateInput = document.getElementById("rateInput");

        if (pinNumberInput && rateInput) {
            let pinNumber = pinNumberInput.value;
            let rate = rateInput.value;
            let selectedOption = '';

            let selectedRadio = document.querySelector('input[name="option"]:checked');
            if (selectedRadio) {
                selectedOption = selectedRadio.value;
            }

            let pinOutInput = {
                type: "Pin-Out",
                pinNumber: pinNumber,
                rate: rate,
                selectedOption: selectedOption
            };
            dataInputs.push(pinOutInput);
        } else {
            console.error("Pin-Out input fields are missing.");
        }

        // Collecting TCP Client data from index.html IDs
        let wifiSSID = document.getElementById("wifiSSID");
        let wifiPassword = document.getElementById("wifiPassword");
        let tcpServerAddress = document.getElementById("tcpServerAddress");
        let port = document.getElementById("port");

        if (wifiSSID && wifiPassword && tcpServerAddress && port) {
            let tcpClientInput = {
                type: "TCP Client",
                wifiSSID: wifiSSID.value,
                wifiPassword: wifiPassword.value,
                tcpServerAddress: tcpServerAddress.value,
                port: port.value
            };
            dataInputs.push(tcpClientInput);
        } else {
            console.error("TCP Client input fields are missing.");
        }

        request_body.atomic = atomics;
        request_body.coupled = coupled;
        request_body.data = dataInputs;

        console.log(request_body);
        return request_body;
    } catch (e) {
        console.error("Transform data error: ", e);
    }
}

function saveToLocalStorage() {
    try {
        //If the user didn't enter anything in any of the fields, it will display an empty string for the empty fields 
        // Fetching the TCP Client user inputs (set up in the index.html file)
        let tcpClientInputs = {
            wifiSSID: document.getElementById("wifiSSID").value,
            wifiPassword: document.getElementById("wifiPassword").value,
            tcpServerAddress: document.getElementById("tcpServerAddress").value,
            port: document.getElementById("port").value
        };

        // Fetching the Pin-Out user inputs (set up in the index.html file)
        let pinOutInputs = {
            pinNumber: document.getElementById("pinNumberInput").value,
            rate: document.getElementById("rateInput").value,
            selectedOption: document.querySelector('input[name="option"]:checked') ? document.querySelector('input[name="option"]:checked').value : ""
        };

        // Store the user inputs in local storage
        localStorage.setItem("tcpClientInputs", JSON.stringify(tcpClientInputs));
        localStorage.setItem("pinOutInputs", JSON.stringify(pinOutInputs));

        console.log("Saved to local storage:", tcpClientInputs, pinOutInputs); //Print to console what was stored to local storage
        alert("Data saved to local storage!"); //Alert user that data was saved to local storage
    } catch (error) {
        console.error("Error saving to local storage:", error); //Else, catch the error and alert user
        alert("Failed to save data to local storage. Please try again.");
    }
}
 //Saving to local storage when "Save" button is clicked (ID set up in index.html)
let saveButton = document.getElementById("saveLocallyButton");
saveButton.addEventListener("click", saveToLocalStorage); //Calling saveToLocalStorage function when user clicks on save button


const modals = document.querySelectorAll('[data-modal]');

modals.forEach(function (trigger) {
    trigger.addEventListener('click', function (event) {
        event.preventDefault();
        const modal = document.getElementById(trigger.dataset.modal);
        modal.classList.add('open');
        const exits = modal.querySelectorAll('.modal-exit');
        exits.forEach(function (exit) {
            exit.addEventListener('click', function (event) {
                event.preventDefault();
                modal.classList.remove('open');
            });
        });
    });
});