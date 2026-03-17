(() => {
    const COMBOBOX_CLASS = "js-combobox";
    const BASE_URL =
        "/index.php?option=com_ajax&plugin=combobox&group=system&format=json&field_name=";

    /**
     * Robust fetch wrapper
     * @param {string} url
     * @param {object} [config] - { method, headers, body, timeout, retries, retryDelay, parseJson, onError }
     * @returns parsed response (JSON by default)
     */
    const getData = async (url, config = {}) => {
        const {
            method = "GET",
            headers = {},
            body = undefined,
            timeout = 8000, // ms
            retries = 0, // number of retries after the initial attempt
            retryDelay = 500, // base retry delay in ms (exponential backoff)
            parseJson = true, // whether to call response.json()
            onError = null // optional callback(err, attempt)
        } = config;

        let attempt = 0;

        while (true) {
            attempt += 1;
            const controller = new AbortController();
            const id = setTimeout(() => controller.abort(), timeout);

            try {
                const resp = await fetch(url, {
                    method,
                    headers,
                    body,
                    signal: controller.signal
                    // credentials: 'same-origin' // uncomment if you need cookies
                });
                clearTimeout(id);

                if (!resp.ok) {
                    // Create an error that includes status for debugging / retry decisions
                    const err = new Error(
                        `HTTP ${resp.status} ${resp.statusText}`
                    );
                    err.status = resp.status;
                    throw err;
                }

                if (parseJson) {
                    // If the server may return non-JSON, wrap parse in try/catch
                    try {
                        return await resp.json();
                    } catch (parseErr) {
                        const err = new Error("Failed to parse JSON response");
                        err.cause = parseErr;
                        throw err;
                    }
                }

                // If not parsing JSON, return the Response object
                return resp;
            } catch (err) {
                clearTimeout(id);
                // Allow caller hook to observe errors
                if (typeof onError === "function") {
                    try {
                        onError(err, attempt);
                    } catch (e) {
                        /* ignore hook failures */
                    }
                }

                // AbortError (fetch timeout) or network issues or HTTP errors land here
                const canRetry = attempt <= retries;
                if (!canRetry) {
                    // no retries left -> rethrow
                    throw err;
                }

                // Exponential backoff (attempt starts at 1)
                const backoff = retryDelay * Math.pow(2, attempt - 1);
                await new Promise((r) => setTimeout(r, backoff));
                // loop will retry
            }
        }
    };

    /**
     * Populate a <select> or a <datalist> from an array of items.
     * Accepts items as either primitives or objects { value, text }.
     * @param {HTMLElement} el
     * @param {Array} items
     */
    /*const populateOptions = (el, items = []) => {
        if (!items || !items.length) return;

        const tag = el.tagName.toUpperCase();

        if (tag === "SELECT") {
            // Clear existing
            el.innerHTML = "";
            items.forEach((item) => {
                const option = document.createElement("option");
                if (item && typeof item === "object") {
                    option.value = item.value ?? item.id ?? item[0] ?? "";
                    option.textContent =
                        item.text ?? item.label ?? option.value;
                } else {
                    option.value = String(item);
                    option.textContent = String(item);
                }
                el.appendChild(option);
            });
            return;
        }

        // If the input has a list attribute referencing a datalist element
        if (tag === "INPUT" && el.list) {
            const dl = document.getElementById(el.list);
            if (!dl) return;
            dl.innerHTML = "";
            items.forEach((item) => {
                const option = document.createElement("option");
                option.value =
                    item && typeof item === "object"
                        ? item.value ?? item.label ?? ""
                        : String(item);
                dl.appendChild(option);
            });
            return;
        }

        // Fallback: store data on dataset and dispatch an event so caller can render
        el.dataset.comboboxOptions = JSON.stringify(items);
        el.dispatchEvent(
            new CustomEvent("combobox:options", { detail: items })
        );
    };*/

    /**
     * Initialize all combobox elements.
     * Options:
     *  - baseUrl override
     *  - getDataConfig per-request config or function(url, element) -> config
     *  - onData(element, data) custom handler instead of populateOptions
     */
    const init = async (options = {}) => {
        const {
            baseUrl = BASE_URL,
            getDataConfig = {}, // object or function(url, el)
            onData = null // optional custom handler (el, data)
        } = options;

        const nodes = document.querySelectorAll("." + COMBOBOX_CLASS);
        // NodeList -> array for for..of
        for (const el of Array.from(nodes)) {

            const fieldId = el.id;
            if (!fieldId) {
                console.warn("js-combobox element missing id attribute", el);
                continue;
            }

            const fieldName = fieldId.replace('jform_com_fields_', '').replace('_', '-');

            const url = `${baseUrl}${encodeURIComponent(fieldName)}`;
            // Determine per-request config
            const cfg =
                typeof getDataConfig === "function"
                    ? getDataConfig(url, el)
                    : getDataConfig;

            try {
                // await the data
                const data = await getData(url, cfg);

                // If user provided custom onData handler, call it; otherwise call populateOptions
                if (typeof onData === "function") {
                    onData(el, data);
                } else {
                    // We expect `data` to be an array; if server returns object, try to find array property
                    let items = data;
                    if (
                        !Array.isArray(items) &&
                        data &&
                        typeof data === "object"
                    ) {
                        // common shapes: { items: [...] } or { data: [...] } or { results: [...] }
                        items = data.items ?? data.data ?? data.results ?? [];
                    }
                    console.log(items);

                    el.classList.replace(COMBOBOX_CLASS, COMBOBOX_CLASS + '--added');
                    accessibleAutocomplete({
                        element: el.parentElement,
                        id: el.id,
                        name: el.name,
                        inputClasses: el.classList.toString(),
                        defaultValue: el.value,
                        showAllValues: true,
                        source: items,
                        dropdownArrow: function (config) {
                          return '<svg width="20" class="' + config.className + '" fill="currentColor" style="top:8px" viewBox="0 0 512 512"><path d="m256 298.3 174.2-167.2c4.3-4.2 11.4-4.1 15.8.2l30.6 29.9c4.4 4.3 4.5 11.3.2 15.5L264.1 380.9c-2.2 2.2-5.2 3.2-8.1 3-3 .1-5.9-.9-8.1-3L35.2 176.7c-4.3-4.2-4.2-11.2.2-15.5L66 131.3c4.4-4.3 11.5-4.4 15.8-.2z"/></svg>'
                        }
                    })
                    el.remove();

                    //populateOptions(el, items);
                }
            } catch (err) {
                // graceful degradation: store error on dataset and emit event, but keep UI responsive
                console.error("Combobox fetch failed for", url, err);
                el.dataset.comboboxError = String(err.message ?? err);
                el.dispatchEvent(
                    new CustomEvent("combobox:error", { detail: err })
                );
            }
        }
    };

    /**
     * DOM ready helper
     * Accepts an optional options object that will be forwarded to init()
     */
    const ready = (fn, options = {}) => {
        const run = () => fn(options);
        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", run);
        } else {
            run();
        }
    };

    // Example: auto init with sensible defaults
    ready(init, {
        // You can override config here if needed:
        getDataConfig: {
            timeout: 7000,
            retries: 2,
            retryDelay: 300,
            headers: {
                Accept: "application/json"
            },
            onError: (err, attempt) => {
                // optional logging hook
                console.warn(`Combobox fetch attempt ${attempt} failed:`, err);
            }
        }
        // Optional custom handler: uncomment to do custom rendering
        // onData: (el, data) => console.log('custom onData', el, data)
    });

    // Expose helpers for manual control if you want
    /*window.ComboboxHelper = {
        init,
        getData,
        populateOptions
    };*/
})();
