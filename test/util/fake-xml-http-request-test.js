(function (root) {
    "use strict";

    var buster = root.buster || require("buster");
    var sinon = root.sinon || require("../../lib/sinon");
    var assert = buster.assert;
    var refute = buster.refute;

    var globalXMLHttpRequest = root.XMLHttpRequest;
    var globalActiveXObject = root.ActiveXObject;

    var supportsProgressEvents = typeof ProgressEvent !== "undefined";
    var supportsFormData = typeof FormData !== "undefined";
    var supportsArrayBuffer = typeof ArrayBuffer !== "undefined";
    var supportsBlob = typeof Blob === "function";

    var fakeXhrSetUp = function () {
        this.fakeXhr = sinon.useFakeXMLHttpRequest();
    };

    var fakeXhrTearDown = function () {
        if (typeof this.fakeXhr.restore === "function") {
            this.fakeXhr.restore();
        }
    };

    var runWithWorkingXHROveride = function (workingXHR, test) {
        try {
            var original = sinon.xhr.workingXHR;
            sinon.xhr.workingXHR = workingXHR;
            test();
        } finally {
            sinon.xhr.workingXHR = original;
        }
    };

    var assertArrayBufferMatches = function (actual, expected) {
        assert(actual instanceof ArrayBuffer, "${0} expected to be an ArrayBuffer");
        var actualString = "";
        var actualView = new Uint8Array(actual);
        for (var i = 0; i < actualView.length; i++) {
            actualString += String.fromCharCode(actualView[i]);
        }
        assert.same(actualString, expected, "ArrayBuffer [${0}] expected to match ArrayBuffer [${1}]");
    };

    var assertBlobMatches = function (actual, expected, done) {
        var actualReader = new FileReader();
        actualReader.onloadend = done(function () {
            assert.same(actualReader.result, expected);
        });
        actualReader.readAsBinaryString(actual);
    };

    var assertProgressEvent = function (event, progress) {
        assert.equals(event.loaded, progress);
        assert.equals(event.total, progress);
        assert.equals(event.lengthComputable, !!progress);
    };

    buster.testCase("sinon.FakeXMLHttpRequest", {
        requiresSupportFor: {
            "browser": typeof window !== "undefined"
        },

        tearDown: function () {
            delete sinon.FakeXMLHttpRequest.onCreate;
        },

        "is constructor": function () {
            assert.isFunction(sinon.FakeXMLHttpRequest);
            assert.same(sinon.FakeXMLHttpRequest.prototype.constructor, sinon.FakeXMLHttpRequest);
        },

        "implements readyState constants": function () {
            assert.same(sinon.FakeXMLHttpRequest.OPENED, 1);
            assert.same(sinon.FakeXMLHttpRequest.HEADERS_RECEIVED, 2);
            assert.same(sinon.FakeXMLHttpRequest.LOADING, 3);
            assert.same(sinon.FakeXMLHttpRequest.DONE, 4);
        },

        "calls onCreate if listener is set": function () {
            var onCreate = sinon.spy();
            sinon.FakeXMLHttpRequest.onCreate = onCreate;

            // instantiating FakeXMLHttpRequest for it's onCreate side effect
            var xhr = new sinon.FakeXMLHttpRequest(); // eslint-disable-line no-unused-vars

            assert(onCreate.called);
        },

        "passes new object to onCreate if set": function () {
            var onCreate = sinon.spy();
            sinon.FakeXMLHttpRequest.onCreate = onCreate;

            var xhr = new sinon.FakeXMLHttpRequest();

            assert.same(onCreate.getCall(0).args[0], xhr);
        },

        ".withCredentials": {
            setUp: function () {
                this.xhr = new sinon.FakeXMLHttpRequest();
            },

            "property is set if we support standards CORS": function () {
                assert.equals(sinon.xhr.supportsCORS, "withCredentials" in this.xhr);
            }

        },

        ".open": {
            setUp: function () {
                this.xhr = new sinon.FakeXMLHttpRequest();
            },

            "is method": function () {
                assert.isFunction(this.xhr.open);
            },

            "sets properties on object": function () {
                this.xhr.open("GET", "/my/url", true, "cjno", "pass");

                assert.equals(this.xhr.method, "GET");
                assert.equals(this.xhr.url, "/my/url");
                assert.isTrue(this.xhr.async);
                assert.equals(this.xhr.username, "cjno");
                assert.equals(this.xhr.password, "pass");

            },

            "is async by default": function () {
                this.xhr.open("GET", "/my/url");

                assert.isTrue(this.xhr.async);
            },

            "sets async to false": function () {
                this.xhr.open("GET", "/my/url", false);

                assert.isFalse(this.xhr.async);
            },

            "sets response to empty string": function () {
                this.xhr.open("GET", "/my/url");

                assert.same(this.xhr.response, "");
            },

            "sets responseText to empty string": function () {
                this.xhr.open("GET", "/my/url");

                assert.same(this.xhr.responseText, "");
            },

            "sets responseXML to null": function () {
                this.xhr.open("GET", "/my/url");

                assert.isNull(this.xhr.responseXML);
            },

            "sets requestHeaders to blank object": function () {
                this.xhr.open("GET", "/my/url");

                assert.isObject(this.xhr.requestHeaders);
                assert.equals(this.xhr.requestHeaders, {});
            },

            "sets readyState to OPENED": function () {
                this.xhr.open("GET", "/my/url");

                assert.same(this.xhr.readyState, sinon.FakeXMLHttpRequest.OPENED);
            },

            "sets send flag to false": function () {
                this.xhr.open("GET", "/my/url");

                assert.isFalse(this.xhr.sendFlag);
            },

            "dispatches onreadystatechange with reset state": function () {
                var state = {};

                this.xhr.onreadystatechange = function () {
                    sinon.extend(state, this);
                };

                this.xhr.open("GET", "/my/url");

                assert.equals(state.method, "GET");
                assert.equals(state.url, "/my/url");
                assert.isTrue(state.async);
                refute.defined(state.username);
                refute.defined(state.password);
                assert.same(state.response, "");
                assert.same(state.responseText, "");
                assert.isNull(state.responseXML);
                refute.defined(state.responseHeaders);
                assert.equals(state.readyState, sinon.FakeXMLHttpRequest.OPENED);
                assert.isFalse(state.sendFlag);
            }
        },

        ".setRequestHeader": {
            setUp: function () {
                this.xhr = new sinon.FakeXMLHttpRequest();
                this.xhr.open("GET", "/");
            },

            "throws exception if readyState is not OPENED": function () {
                var xhr = new sinon.FakeXMLHttpRequest();

                assert.exception(function () {
                    xhr.setRequestHeader("X-EY", "No-no");
                });
            },

            "throws exception if send flag is true": function () {
                var xhr = this.xhr;
                xhr.sendFlag = true;

                assert.exception(function () {
                    xhr.setRequestHeader("X-EY", "No-no");
                });
            },

            "disallows unsafe headers": function () {
                var xhr = this.xhr;

                assert.exception(function () {
                    xhr.setRequestHeader("Accept-Charset", "");
                });

                assert.exception(function () {
                    xhr.setRequestHeader("Accept-Encoding", "");
                });

                assert.exception(function () {
                    xhr.setRequestHeader("Connection", "");
                });

                assert.exception(function () {
                    xhr.setRequestHeader("Content-Length", "");
                });

                assert.exception(function () {
                    xhr.setRequestHeader("Cookie", "");
                });

                assert.exception(function () {
                    xhr.setRequestHeader("Cookie2", "");
                });

                assert.exception(function () {
                    xhr.setRequestHeader("Content-Transfer-Encoding", "");
                });

                assert.exception(function () {
                    xhr.setRequestHeader("Date", "");
                });

                assert.exception(function () {
                    xhr.setRequestHeader("Expect", "");
                });

                assert.exception(function () {
                    xhr.setRequestHeader("Host", "");
                });

                assert.exception(function () {
                    xhr.setRequestHeader("Keep-Alive", "");
                });

                assert.exception(function () {
                    xhr.setRequestHeader("Referer", "");
                });

                assert.exception(function () {
                    xhr.setRequestHeader("TE", "");
                });

                assert.exception(function () {
                    xhr.setRequestHeader("Trailer", "");
                });

                assert.exception(function () {
                    xhr.setRequestHeader("Transfer-Encoding", "");
                });

                assert.exception(function () {
                    xhr.setRequestHeader("Upgrade", "");
                });

                assert.exception(function () {
                    xhr.setRequestHeader("User-Agent", "");
                });

                assert.exception(function () {
                    xhr.setRequestHeader("Via", "");
                });

                assert.exception(function () {
                    xhr.setRequestHeader("Proxy-Oops", "");
                });

                assert.exception(function () {
                    xhr.setRequestHeader("Sec-Oops", "");
                });
            },

            "sets header and value": function () {
                this.xhr.setRequestHeader("X-Fake", "Yeah!");

                assert.equals(this.xhr.requestHeaders, { "X-Fake": "Yeah!" });
            },

            "appends same-named header values": function () {
                this.xhr.setRequestHeader("X-Fake", "Oh");
                this.xhr.setRequestHeader("X-Fake", "yeah!");

                assert.equals(this.xhr.requestHeaders, { "X-Fake": "Oh,yeah!" });
            }
        },

        ".send": {
            setUp: function () {
                this.xhr = new sinon.FakeXMLHttpRequest();
            },

            "throws if request is not open": function () {
                var xhr = new sinon.FakeXMLHttpRequest();

                assert.exception(function () {
                    xhr.send();
                });
            },

            "throws if send flag is true": function () {
                var xhr = this.xhr;
                xhr.open("GET", "/");
                xhr.sendFlag = true;

                assert.exception(function () {
                    xhr.send();
                });
            },

            "sets GET body to null": function () {
                this.xhr.open("GET", "/");
                this.xhr.send("Data");

                assert.isNull(this.xhr.requestBody);
            },

            "sets HEAD body to null": function () {
                this.xhr.open("HEAD", "/");
                this.xhr.send("Data");

                assert.isNull(this.xhr.requestBody);
            },

            "sets mime to text/plain": {
                requiresSupportFor: {
                    "FormData": supportsFormData
                },

                test: function () {
                    this.xhr.open("POST", "/");
                    this.xhr.send("Data");

                    assert.equals(this.xhr.requestHeaders["Content-Type"], "text/plain;charset=utf-8");
                }
            },

            "does not override mime": function () {
                this.xhr.open("POST", "/");
                this.xhr.setRequestHeader("Content-Type", "text/html");
                this.xhr.send("Data");

                assert.equals(this.xhr.requestHeaders["Content-Type"], "text/html;charset=utf-8");
            },

            "does not add new 'Content-Type' header if 'content-type' already exists": function () {
                this.xhr.open("POST", "/");
                this.xhr.setRequestHeader("content-type", "application/json");
                this.xhr.send("Data");

                assert.equals(this.xhr.requestHeaders["Content-Type"], undefined);
                assert.equals(this.xhr.requestHeaders["content-type"], "application/json;charset=utf-8");
            },

            "does not add 'Content-Type' header if data is FormData": {
                requiresSupportFor: {
                    "FormData": supportsFormData
                },

                test: function () {
                    this.xhr.open("POST", "/");
                    var formData = new FormData();
                    formData.append("username", "biz");
                    this.xhr.send("Data");

                    assert.equals(this.xhr.requestHeaders["content-type"], undefined);
                }
            },

            "sets request body to string data": function () {
                this.xhr.open("POST", "/");
                this.xhr.send("Data");

                assert.equals(this.xhr.requestBody, "Data");
            },

            "sets error flag to false": function () {
                this.xhr.open("POST", "/");
                this.xhr.send("Data");

                assert.isFalse(this.xhr.errorFlag);
            },

            "sets send flag to true": function () {
                this.xhr.open("POST", "/");
                this.xhr.send("Data");

                assert.isTrue(this.xhr.sendFlag);
            },

            "does not set send flag to true if sync": function () {
                this.xhr.open("POST", "/", false);
                this.xhr.send("Data");

                assert.isFalse(this.xhr.sendFlag);
            },

            "dispatches onreadystatechange": function () {
                var event, state;
                this.xhr.open("POST", "/", false);

                this.xhr.onreadystatechange = function (e) {
                    event = e;
                    state = this.readyState;
                };

                this.xhr.send("Data");

                assert.equals(state, sinon.FakeXMLHttpRequest.OPENED);
                assert.equals(event.type, "readystatechange");
                assert.defined(event.target);
            },

            "dispatches event using DOM Event interface": function () {
                var listener = sinon.spy();
                this.xhr.open("POST", "/", false);
                this.xhr.addEventListener("readystatechange", listener);

                this.xhr.send("Data");

                assert(listener.calledOnce);
                assert.equals(listener.args[0][0].type, "readystatechange");
                assert.defined(listener.args[0][0].target);
            },

            "dispatches onSend callback if set": function () {
                this.xhr.open("POST", "/", true);
                var callback = sinon.spy();
                this.xhr.onSend = callback;

                this.xhr.send("Data");

                assert(callback.called);
            },

            "dispatches onSend with request as argument": function () {
                this.xhr.open("POST", "/", true);
                var callback = sinon.spy();
                this.xhr.onSend = callback;

                this.xhr.send("Data");

                assert(callback.calledWith(this.xhr));
            },

            "dispatches onSend when async": function () {
                this.xhr.open("POST", "/", false);
                var callback = sinon.spy();
                this.xhr.onSend = callback;

                this.xhr.send("Data");

                assert(callback.calledWith(this.xhr));
            }
        },

        ".setResponseHeaders": {
            setUp: function () {
                this.xhr = new sinon.FakeXMLHttpRequest();
            },

            "sets request headers": function () {
                var object = { id: 42 };
                this.xhr.open("GET", "/");
                this.xhr.send();
                this.xhr.setResponseHeaders(object);

                assert.equals(this.xhr.responseHeaders, object);
            },

            "calls readyStateChange with HEADERS_RECEIVED": function () {
                var object = { id: 42 };
                this.xhr.open("GET", "/");
                this.xhr.send();
                var spy = this.xhr.readyStateChange = sinon.spy();

                this.xhr.setResponseHeaders(object);

                assert(spy.calledWith(sinon.FakeXMLHttpRequest.HEADERS_RECEIVED));
            },

            "does not call readyStateChange if sync": function () {
                var object = { id: 42 };
                this.xhr.open("GET", "/", false);
                this.xhr.send();
                var spy = this.xhr.readyStateChange = sinon.spy();

                this.xhr.setResponseHeaders(object);

                assert.isFalse(spy.called);
            },

            "changes readyState to HEADERS_RECEIVED if sync": function () {
                var object = { id: 42 };
                this.xhr.open("GET", "/", false);
                this.xhr.send();

                this.xhr.setResponseHeaders(object);

                assert.equals(this.xhr.readyState, sinon.FakeXMLHttpRequest.HEADERS_RECEIVED);
            },

            "throws if headers were already set": function () {
                var xhr = this.xhr;

                xhr.open("GET", "/", false);
                xhr.send();
                xhr.setResponseHeaders({});

                assert.exception(function () {
                    xhr.setResponseHeaders({});
                });
            }
        },

        ".setResponseBodyAsync": {
            setUp: function () {
                this.xhr = new sinon.FakeXMLHttpRequest();
                this.xhr.open("GET", "/");
                this.xhr.send();
                this.xhr.setResponseHeaders({});
            },

            "invokes onreadystatechange handler with LOADING state": function () {
                var spy = sinon.spy();
                this.xhr.readyStateChange = spy;

                this.xhr.setResponseBody("Some text goes in here ok?");

                assert(spy.calledWith(sinon.FakeXMLHttpRequest.LOADING));
            },

            "invokes onreadystatechange handler for each 10 byte chunk": function () {
                var spy = sinon.spy();
                this.xhr.readyStateChange = spy;
                this.xhr.chunkSize = 10;

                this.xhr.setResponseBody("Some text goes in here ok?");

                assert.equals(spy.callCount, 4);
            },

            "invokes onreadystatechange handler for each x byte chunk": function () {
                var spy = sinon.spy();
                this.xhr.readyStateChange = spy;
                this.xhr.chunkSize = 20;

                this.xhr.setResponseBody("Some text goes in here ok?");

                assert.equals(spy.callCount, 3);
            },

            "invokes onreadystatechange handler with partial data": function () {
                var pieces = [];
                var mismatch = false;

                this.xhr.readyStateChange = function () {
                    if (this.response !== this.responseText) {
                        mismatch = true;
                    }
                    pieces.push(this.responseText);
                };
                this.xhr.chunkSize = 9;

                this.xhr.setResponseBody("Some text goes in here ok?");

                assert.isFalse(mismatch);
                assert.equals(pieces[1], "Some text");
            },

            "calls onreadystatechange with DONE state": function () {
                var spy = sinon.spy();
                this.xhr.readyStateChange = spy;

                this.xhr.setResponseBody("Some text goes in here ok?");

                assert(spy.calledWith(sinon.FakeXMLHttpRequest.DONE));
            },

            "throws if not open": function () {
                var xhr = new sinon.FakeXMLHttpRequest();

                assert.exception(function () {
                    xhr.setResponseBody("");
                });
            },

            "throws if no headers received": function () {
                var xhr = new sinon.FakeXMLHttpRequest();
                xhr.open("GET", "/");
                xhr.send();

                assert.exception(function () {
                    xhr.setResponseBody("");
                });
            },

            "throws if body was already sent": function () {
                var xhr = new sinon.FakeXMLHttpRequest();
                xhr.open("GET", "/");
                xhr.send();
                xhr.setResponseHeaders({});
                xhr.setResponseBody("");

                assert.exception(function () {
                    xhr.setResponseBody("");
                });
            },

            "throws if body is not a string": function () {
                var xhr = new sinon.FakeXMLHttpRequest();
                xhr.open("GET", "/");
                xhr.send();
                xhr.setResponseHeaders({});

                assert.exception(function () {
                    xhr.setResponseBody({});
                }, "InvalidBodyException");
            },

            "with ArrayBuffer support": {
                requiresSupportFor: {
                    "ArrayBuffer": supportsArrayBuffer
                },

                "invokes onreadystatechange for each chunk when responseType='arraybuffer'": function () {
                    var spy = sinon.spy();
                    this.xhr.readyStateChange = spy;
                    this.xhr.chunkSize = 10;

                    this.xhr.responseType = "arraybuffer";

                    this.xhr.setResponseBody("Some text goes in here ok?");

                    assert.equals(spy.callCount, 4);
                }
            },

            "with Blob support": {
                requiresSupportFor: {
                    "Blob": supportsBlob
                },

                "invokes onreadystatechange handler for each 10 byte chunk when responseType='blob'": function () {
                    var spy = sinon.spy();
                    this.xhr.readyStateChange = spy;
                    this.xhr.chunkSize = 10;

                    this.xhr.responseType = "blob";

                    this.xhr.setResponseBody("Some text goes in here ok?");

                    assert.equals(spy.callCount, 4);
                }
            }
        },

        ".setResponseBodySync": {
            setUp: function () {
                this.xhr = new sinon.FakeXMLHttpRequest();
                this.xhr.open("GET", "/", false);
                this.xhr.send();
                this.xhr.setResponseHeaders({});
            },

            "does not throw": function () {
                var xhr = this.xhr;

                refute.exception(function () {
                    xhr.setResponseBody("");
                });
            },

            "sets readyState to DONE": function () {
                this.xhr.setResponseBody("");

                assert.equals(this.xhr.readyState, sinon.FakeXMLHttpRequest.DONE);
            },

            "throws if responding to request twice": function () {
                var xhr = this.xhr;
                this.xhr.setResponseBody("");

                assert.exception(function () {
                    xhr.setResponseBody("");
                });
            },

            "calls onreadystatechange for sync request with DONE state": function () {
                var spy = sinon.spy();
                this.xhr.readyStateChange = spy;

                this.xhr.setResponseBody("Some text goes in here ok?");

                assert(spy.calledWith(sinon.FakeXMLHttpRequest.DONE));
            },

            "simulates synchronous request": function () {
                var xhr = new sinon.FakeXMLHttpRequest();

                xhr.onSend = function () {
                    this.setResponseHeaders({});
                    this.setResponseBody("Oh yeah");
                };

                xhr.open("GET", "/", false);
                xhr.send();

                assert.equals(xhr.responseText, "Oh yeah");
            }
        },

        ".respond": {
            setUp: function () {
                this.sandbox = sinon.sandbox.create();
                this.xhr = new sinon.FakeXMLHttpRequest();
                this.xhr.open("GET", "/");
                var spy = this.spy = sinon.spy();

                this.xhr.onreadystatechange = function () {
                    if (this.readyState === 4) {
                        spy.call(this);
                    }
                };

                this.xhr.send();
            },

            tearDown: function () {
                this.sandbox.restore();
            },

            "fire onload event": function () {
                this.onload = this.spy;
                this.xhr.respond(200, {}, "");
                assert.equals(this.spy.callCount, 1);
            },

            "fire onload event with this set to the XHR object": function (done) {
                var xhr = new sinon.FakeXMLHttpRequest();
                xhr.open("GET", "/");

                xhr.onload = function () {
                    assert.same(this, xhr);

                    done();
                };

                xhr.send();
                xhr.respond(200, {}, "");
            },

            "calls readystate handler with readyState DONE once": function () {
                this.xhr.respond(200, {}, "");

                assert.equals(this.spy.callCount, 1);
            },

            "defaults to status 200, no headers, and blank body": function () {
                this.xhr.respond();

                assert.equals(this.xhr.status, 200);
                assert.equals(this.xhr.getAllResponseHeaders(), "");
                assert.equals(this.xhr.responseText, "");
            },

            "sets status": function () {
                this.xhr.respond(201);

                assert.equals(this.xhr.status, 201);
            },

            "sets status text": function () {
                this.xhr.respond(201);

                assert.equals(this.xhr.statusText, "Created");
            },

            "sets headers": function () {
                sinon.spy(this.xhr, "setResponseHeaders");
                var responseHeaders = { some: "header", value: "over here" };
                this.xhr.respond(200, responseHeaders);

                assert.equals(this.xhr.setResponseHeaders.args[0][0], responseHeaders);
            },

            "sets response text": function () {
                this.xhr.respond(200, {}, "'tis some body text");

                assert.equals(this.xhr.responseText, "'tis some body text");
            },

            "completes request when onreadystatechange fails": function () {
                this.sandbox.stub(sinon, "logError"); // reduce console spam in the test runner

                this.xhr.onreadystatechange = sinon.stub().throws();
                this.xhr.respond(200, {}, "'tis some body text");

                assert.equals(this.xhr.onreadystatechange.callCount, 4);
            },

            "sets status before transitioning to readyState HEADERS_RECEIVED": function () {
                var status, statusText;
                this.xhr.onreadystatechange = function () {
                    if (this.readyState === 2) {
                        status = this.status;
                        statusText = this.statusText;
                    }
                };
                this.xhr.respond(204);

                assert.equals(status, 204);
                assert.equals(statusText, "No Content");
            }
        },

        ".getResponseHeader": {
            setUp: function () {
                this.xhr = new sinon.FakeXMLHttpRequest();
            },

            "returns null if request is not finished": function () {
                this.xhr.open("GET", "/");
                assert.isNull(this.xhr.getResponseHeader("Content-Type"));
            },

            "returns null if header is Set-Cookie": function () {
                this.xhr.open("GET", "/");
                this.xhr.send();

                assert.isNull(this.xhr.getResponseHeader("Set-Cookie"));
            },

            "returns null if header is Set-Cookie2": function () {
                this.xhr.open("GET", "/");
                this.xhr.send();

                assert.isNull(this.xhr.getResponseHeader("Set-Cookie2"));
            },

            "returns header value": function () {
                this.xhr.open("GET", "/");
                this.xhr.send();
                this.xhr.setResponseHeaders({ "Content-Type": "text/html" });

                assert.equals(this.xhr.getResponseHeader("Content-Type"), "text/html");
            },

            "returns header value if sync": function () {
                this.xhr.open("GET", "/", false);
                this.xhr.send();
                this.xhr.setResponseHeaders({ "Content-Type": "text/html" });

                assert.equals(this.xhr.getResponseHeader("Content-Type"), "text/html");
            },

            "returns null if header is not set": function () {
                this.xhr.open("GET", "/");
                this.xhr.send();

                assert.isNull(this.xhr.getResponseHeader("Content-Type"));
            },

            "returns headers case insensitive": function () {
                this.xhr.open("GET", "/");
                this.xhr.send();
                this.xhr.setResponseHeaders({ "Content-Type": "text/html" });

                assert.equals(this.xhr.getResponseHeader("content-type"), "text/html");
            }
        },

        ".getAllResponseHeaders": {
            setUp: function () {
                this.xhr = new sinon.FakeXMLHttpRequest();
            },

            "returns empty string if request is not finished": function () {
                this.xhr.open("GET", "/");
                assert.equals(this.xhr.getAllResponseHeaders(), "");
            },

            "does not return Set-Cookie and Set-Cookie2 headers": function () {
                this.xhr.open("GET", "/");
                this.xhr.send();
                this.xhr.setResponseHeaders({
                    "Set-Cookie": "Hey",
                    "Set-Cookie2": "There"
                });

                assert.equals(this.xhr.getAllResponseHeaders(), "");
            },

            "returns headers": function () {
                this.xhr.open("GET", "/");
                this.xhr.send();
                this.xhr.setResponseHeaders({
                    "Content-Type": "text/html",
                    "Set-Cookie2": "There",
                    "Content-Length": "32"
                });

                assert.equals(this.xhr.getAllResponseHeaders(), "Content-Type: text/html\r\nContent-Length: 32\r\n");
            },

            "returns headers if sync": function () {
                this.xhr.open("GET", "/", false);
                this.xhr.send();
                this.xhr.setResponseHeaders({
                    "Content-Type": "text/html",
                    "Set-Cookie2": "There",
                    "Content-Length": "32"
                });

                assert.equals(this.xhr.getAllResponseHeaders(), "Content-Type: text/html\r\nContent-Length: 32\r\n");
            }
        },

        ".abort": {
            setUp: function () {
                this.xhr = new sinon.FakeXMLHttpRequest();
            },

            "sets aborted flag to true": function () {
                this.xhr.abort();

                assert.isTrue(this.xhr.aborted);
            },

            "sets response to empty string": function () {
                this.xhr.response = "Partial data";

                this.xhr.abort();

                assert.same(this.xhr.response, "");
            },

            "sets responseText to empty string": function () {
                this.xhr.responseText = "Partial data";

                this.xhr.abort();

                assert.same(this.xhr.responseText, "");
            },

            "sets errorFlag to true": function () {
                this.xhr.abort();

                assert.isTrue(this.xhr.errorFlag);
            },

            "nulls request headers": function () {
                this.xhr.open("GET", "/");
                this.xhr.setRequestHeader("X-Test", "Sumptn");

                this.xhr.abort();

                assert.equals(this.xhr.requestHeaders, {});
            },

            "does not have undefined response headers": function () {
                this.xhr.open("GET", "/");

                this.xhr.abort();

                assert.defined(this.xhr.responseHeaders);
            },

            "nulls response headers": function () {
                this.xhr.open("GET", "/");

                this.xhr.abort();

                assert.equals(this.xhr.responseHeaders, {});
            },

            "sets state to DONE if sent before": function () {
                var readyState;
                this.xhr.open("GET", "/");
                this.xhr.send();

                this.xhr.onreadystatechange = function () {
                    readyState = this.readyState;
                };

                this.xhr.abort();

                assert.equals(readyState, sinon.FakeXMLHttpRequest.DONE);
            },

            "sets send flag to false if sent before": function () {
                this.xhr.open("GET", "/");
                this.xhr.send();

                this.xhr.abort();

                assert.isFalse(this.xhr.sendFlag);
            },

            "dispatches readystatechange event if sent before": function () {
                this.xhr.open("GET", "/");
                this.xhr.send();
                this.xhr.onreadystatechange = sinon.stub();

                this.xhr.abort();

                assert(this.xhr.onreadystatechange.called);
            },

            "sets readyState to unsent if sent before": function () {
                this.xhr.open("GET", "/");
                this.xhr.send();

                this.xhr.abort();

                assert.equals(this.xhr.readyState, sinon.FakeXMLHttpRequest.UNSENT);
            },

            "does not dispatch readystatechange event if readyState is unsent": function () {
                this.xhr.onreadystatechange = sinon.stub();

                this.xhr.abort();

                assert.isFalse(this.xhr.onreadystatechange.called);
            },

            "does not dispatch readystatechange event if readyState is opened but not sent": function () {
                this.xhr.open("GET", "/");
                this.xhr.onreadystatechange = sinon.stub();

                this.xhr.abort();

                assert.isFalse(this.xhr.onreadystatechange.called);
            },

            // see: https://xhr.spec.whatwg.org/#request-error-steps
            "should follow request error steps": function (done) {
                var expectedOrder = [
                    "upload:progress",
                    "upload:abort",
                    "upload:loadend",
                    "xhr:progress",
                    "xhr:onabort",
                    "xhr:abort"
                ];
                var eventOrder = [];

                function observe(name) {
                    return function (e) {
                        assertProgressEvent(e, 0);
                        eventOrder.push(name);
                    };
                }

                this.xhr.open("GET", "/");
                this.xhr.send();

                this.xhr.upload.addEventListener("progress", observe("upload:progress"));
                this.xhr.upload.addEventListener("abort", observe("upload:abort"));
                this.xhr.upload.addEventListener("loadend", observe("upload:loadend"));
                this.xhr.addEventListener("progress", observe("xhr:progress"));
                this.xhr.addEventListener("abort", observe("xhr:abort"));
                this.xhr.onabort = observe("xhr:onabort");
                this.xhr.addEventListener("loadend", function (e) {
                    assertProgressEvent(e, 0);
                    assert.equals(eventOrder, expectedOrder);

                    done();
                });

                this.xhr.abort();
            }
        },

        ".response": {
            requiresSupportFor: {
                "browser": typeof window !== "undefined"
            },
            setUp: function () {
                this.xhr = new sinon.FakeXMLHttpRequest();
            },

            "is initially the empty string if responseType === ''": function () {
                this.xhr.responseType = "";
                this.xhr.open("GET", "/");
                assert.same(this.xhr.response, "");
            },

            "is initially the empty string if responseType === 'text'": function () {
                this.xhr.responseType = "text";
                this.xhr.open("GET", "/");
                assert.same(this.xhr.response, "");
            },

            "is initially null if responseType === 'json'": function () {
                this.xhr.responseType = "json";
                this.xhr.open("GET", "/");
                assert.isNull(this.xhr.response);
            },

            "is initially null if responseType === 'document'": function () {
                this.xhr.responseType = "document";
                this.xhr.open("GET", "/");
                assert.isNull(this.xhr.response);
            },

            "is the empty string when the response body is empty": function () {
                this.xhr.open("GET", "/");
                this.xhr.send();

                this.xhr.respond(200, {}, "");

                assert.same(this.xhr.response, "");
            },

            "parses JSON for responseType='json'": function () {
                this.xhr.responseType = "json";
                this.xhr.open("GET", "/");
                this.xhr.send();

                this.xhr.respond(200, { "Content-Type": "application/json" },
                                 JSON.stringify({foo: true}));

                var response = this.xhr.response;
                assert.isObject(response);
                assert.isTrue(response.foo);
            },

            "does not parse JSON if responseType!='json'": function () {
                this.xhr.open("GET", "/");
                this.xhr.send();

                var responseText = JSON.stringify({foo: true});

                this.xhr.respond(200, { "Content-Type": "application/json" },
                                 responseText);

                var response = this.xhr.response;
                assert.isString(response);
                assert.equals(response, responseText);
            },

            "with ArrayBuffer support": {
                requiresSupportFor: {
                    "ArrayBuffer": supportsArrayBuffer
                },

                "is initially null if responseType === 'arraybuffer'": function () {
                    this.xhr.responseType = "arraybuffer";
                    this.xhr.open("GET", "/");
                    assert.isNull(this.xhr.response);
                },

                "defaults to empty ArrayBuffer response": function () {
                    this.xhr.responseType = "arraybuffer";
                    this.xhr.open("GET", "/");
                    this.xhr.send();

                    this.xhr.respond();
                    assertArrayBufferMatches(this.xhr.response, "");
                },

                "returns ArrayBuffer when responseType='arraybuffer'": function () {
                    this.xhr.responseType = "arraybuffer";
                    this.xhr.open("GET", "/");
                    this.xhr.send();

                    this.xhr.respond(200, { "Content-Type": "application/octet-stream" }, "a test buffer");

                    assertArrayBufferMatches(this.xhr.response, "a test buffer");
                },

                "returns binary data correctly when responseType='arraybuffer'": function () {
                    this.xhr.responseType = "arraybuffer";
                    this.xhr.open("GET", "/");
                    this.xhr.send();

                    this.xhr.respond(200, { "Content-Type": "application/octet-stream" }, "\xFF");

                    assertArrayBufferMatches(this.xhr.response, "\xFF");
                }
            },

            "with Blob support": {
                requiresSupportFor: {
                    "Blob": supportsBlob
                },

                "is initially null if responseType === 'blob'": function () {
                    this.xhr.responseType = "blob";
                    this.xhr.open("GET", "/");
                    assert.isNull(this.xhr.response);
                },

                "defaults to empty Blob response": function (done) {
                    this.xhr.responseType = "blob";
                    this.xhr.open("GET", "/");
                    this.xhr.send();

                    this.xhr.respond();

                    assertBlobMatches(this.xhr.response, "", done);
                },

                "returns blob with correct data": function (done) {
                    this.xhr.responseType = "blob";
                    this.xhr.open("GET", "/");
                    this.xhr.send();

                    this.xhr.respond(200, { "Content-Type": "application/octet-stream" }, "a test blob");

                    assertBlobMatches(this.xhr.response, "a test blob", done);
                },

                "returns blob with correct binary data": function (done) {
                    this.xhr.responseType = "blob";
                    this.xhr.open("GET", "/");
                    this.xhr.send();

                    this.xhr.respond(200, { "Content-Type": "application/octet-stream" }, "\xFF");

                    assertBlobMatches(this.xhr.response, "\xFF", done);
                }
            }
        },

        ".responseXML": {
            requiresSupportFor: {
                "browser": typeof window !== "undefined"
            },
            setUp: function () {
                this.xhr = new sinon.FakeXMLHttpRequest();
            },

            "is initially null": function () {
                this.xhr.open("GET", "/");
                assert.isNull(this.xhr.responseXML);
            },

            "is null when the response body is empty": function () {
                this.xhr.open("GET", "/");
                this.xhr.send();

                this.xhr.respond(200, {}, "");

                assert.isNull(this.xhr.responseXML);
            },

            "parses XML for application/xml": function () {
                this.xhr.open("GET", "/");
                this.xhr.send();

                this.xhr.respond(200, { "Content-Type": "application/xml" },
                                 "<div><h1>Hola!</h1></div>");

                var doc = this.xhr.responseXML;
                var elements = doc.documentElement.getElementsByTagName("h1");
                assert.equals(elements.length, 1);
                assert.equals(elements[0].tagName, "h1");
            },

            "parses XML for text/xml": function () {
                this.xhr.open("GET", "/");
                this.xhr.send();

                this.xhr.respond(200, { "Content-Type": "text/xml" },
                                 "<div><h1>Hola!</h1></div>");

                refute.isNull(this.xhr.responseXML);
            },

            "parses XML for custom xml content type": function () {
                this.xhr.open("GET", "/");
                this.xhr.send();

                this.xhr.respond(200, { "Content-Type": "application/text+xml" },
                                 "<div><h1>Hola!</h1></div>");

                refute.isNull(this.xhr.responseXML);
            },

            "parses XML with no Content-Type": function () {
                this.xhr.open("GET", "/");
                this.xhr.send();

                this.xhr.respond(200, {}, "<div><h1>Hola!</h1></div>");

                var doc = this.xhr.responseXML;
                var elements = doc.documentElement.getElementsByTagName("h1");
                assert.equals(elements.length, 1);
                assert.equals(elements[0].tagName, "h1");
            },

            "does not parse XML with Content-Type text/plain": function () {
                this.xhr.open("GET", "/");
                this.xhr.send();

                this.xhr.respond(200, { "Content-Type": "text/plain" }, "<div></div>");

                assert.isNull(this.xhr.responseXML);
            },

            "does not parse XML with Content-Type text/plain if sync": function () {
                this.xhr.open("GET", "/", false);
                this.xhr.send();

                this.xhr.respond(200, { "Content-Type": "text/plain" }, "<div></div>");

                assert.isNull(this.xhr.responseXML);
            }
        },

        "stub XHR": {
            setUp: fakeXhrSetUp,
            tearDown: fakeXhrTearDown,

            "returns FakeXMLHttpRequest constructor": function () {
                assert.same(this.fakeXhr, sinon.FakeXMLHttpRequest);
            },

            "temporarily blesses FakeXMLHttpRequest with restore method": function () {
                assert.isFunction(this.fakeXhr.restore);
            },

            "calling restore removes temporary method": function () {
                this.fakeXhr.restore();

                refute.defined(this.fakeXhr.restore);
            },

            "removes XMLHttpRequest onCreate listener": function () {
                sinon.FakeXMLHttpRequest.onCreate = function () {};

                this.fakeXhr.restore();

                refute.defined(sinon.FakeXMLHttpRequest.onCreate);
            },

            "optionally keeps XMLHttpRequest onCreate listener": function () {
                var onCreate = function () {};
                sinon.FakeXMLHttpRequest.onCreate = onCreate;

                this.fakeXhr.restore(true);

                assert.same(sinon.FakeXMLHttpRequest.onCreate, onCreate);
            }
        },

        ".filtering": {
            setUp: function () {
                sinon.FakeXMLHttpRequest.useFilters = true;
                sinon.FakeXMLHttpRequest.filters = [];
                sinon.useFakeXMLHttpRequest();
            },

            tearDown: function () {
                sinon.FakeXMLHttpRequest.useFilters = false;
                sinon.FakeXMLHttpRequest.restore();
                if (sinon.FakeXMLHttpRequest.defake.restore) {
                    sinon.FakeXMLHttpRequest.defake.restore();
                }
            },

            "does not defake XHR requests that don't match a filter": {
                requiresSupportFor: {
                    "XMLHttpRequest": typeof XMLHttpRequest !== "undefined"
                },
                test: function () {
                    sinon.stub(sinon.FakeXMLHttpRequest, "defake");

                    sinon.FakeXMLHttpRequest.addFilter(function () {
                        return false;
                    });
                    new XMLHttpRequest().open("GET", "http://example.com");

                    refute(sinon.FakeXMLHttpRequest.defake.called);
                }
            },

            "defakes XHR requests that match a filter": {
                requiresSupportFor: {
                    "XMLHttpRequest": typeof XMLHttpRequest !== "undefined"
                },
                test: function () {
                    sinon.stub(sinon.FakeXMLHttpRequest, "defake");

                    sinon.FakeXMLHttpRequest.addFilter(function () {
                        return true;
                    });
                    new XMLHttpRequest().open("GET", "http://example.com");

                    assert(sinon.FakeXMLHttpRequest.defake.calledOnce);
                }
            }
        },

        "defaked XHR": {
            setUp: function () {
                this.fakeXhr = new sinon.FakeXMLHttpRequest();
            },

            "updates attributes from working XHR object when ready state changes": function () {
                var workingXHRInstance,
                    readyStateCb;
                var workingXHROverride = function () {
                    workingXHRInstance = this;
                    this.addEventListener = function (str, fn) {
                        readyStateCb = fn;
                    };
                    this.open = function () {};
                };
                var fakeXhr = this.fakeXhr;
                runWithWorkingXHROveride(workingXHROverride, function () {
                    sinon.FakeXMLHttpRequest.defake(fakeXhr, []);
                    workingXHRInstance.statusText = "This is the status text of the real XHR";
                    workingXHRInstance.readyState = 4;
                    readyStateCb();
                    assert.equals(fakeXhr.statusText, "This is the status text of the real XHR");
                });
            },

            "passes on methods to working XHR object": function () {
                var workingXHRInstance,
                    spy;
                var workingXHROverride = function () {
                    workingXHRInstance = this;
                    this.addEventListener = this.open = function () {};
                };
                var fakeXhr = this.fakeXhr;
                runWithWorkingXHROveride(workingXHROverride, function () {
                    sinon.FakeXMLHttpRequest.defake(fakeXhr, []);
                    workingXHRInstance.getResponseHeader = spy = sinon.spy();
                    fakeXhr.getResponseHeader();
                    assert(spy.calledOnce);
                });
            },

            "calls legacy onreadystatechange handlers with target set to fakeXHR": function () {
                var spy,
                    readyStateCb;
                var workingXHROverride = function () {
                    this.addEventListener = function (str, fn) {
                        readyStateCb = fn;
                    };
                    this.open = function () {};
                };
                var fakeXhr = this.fakeXhr;

                runWithWorkingXHROveride(workingXHROverride, function () {
                    sinon.FakeXMLHttpRequest.defake(fakeXhr, []);
                    fakeXhr.onreadystatechange = spy = sinon.spy();
                    readyStateCb();
                    assert(spy.calledOnce);

                    // Fix to make weinre work
                    assert.isObject(spy.args[0][0]);
                    assert.equals(spy.args[0][0].target, fakeXhr);
                });
            },

            "performs initial readystatechange on opening when filters are being used, but don't match": function () {
                try {
                    sinon.FakeXMLHttpRequest.useFilters = true;
                    var spy = sinon.spy();
                    this.fakeXhr.addEventListener("readystatechange", spy);
                    this.fakeXhr.open("GET", "http://example.com", true);
                    assert(spy.calledOnce);
                } finally {
                    sinon.FakeXMLHttpRequest.useFilters = false;
                }
            }
        },

        "defaked XHR filters": {
            setUp: function () {
                sinon.FakeXMLHttpRequest.useFilters = true;
                sinon.FakeXMLHttpRequest.filters = [];
                sinon.useFakeXMLHttpRequest();
                sinon.FakeXMLHttpRequest.addFilter(function () {
                    return true;
                });
            },

            tearDown: function () {
                sinon.FakeXMLHttpRequest.useFilters = false;
                sinon.FakeXMLHttpRequest.filters = [];
                sinon.FakeXMLHttpRequest.restore();
            },

            "// loads resource asynchronously": function (done) {
                var req = new XMLHttpRequest();

                req.onreadystatechange = function () {
                    if (this.readyState === 4) {
                        assert.match(this.responseText, /loaded successfully/);
                        assert.match(this.response, /loaded successfully/);
                        done();
                    }
                };

                req.open("GET", "/test/resources/xhr_target.txt", true);
                req.send();
            },

            "// loads resource synchronously": function () {
                var req = new XMLHttpRequest();
                req.open("GET", "/test/resources/xhr_target.txt", false);
                req.send();

                assert.match(req.responseText, /loaded successfully/);
                assert.match(req.response, /loaded successfully/);
            }
        },

        "missing ActiveXObject": {
            requiresSupportFor: {
                "no ActiveXObject": typeof ActiveXObject === "undefined"
            },
            setUp: fakeXhrSetUp,
            tearDown: fakeXhrTearDown,

            "does not expose ActiveXObject": function () {
                assert.equals(typeof ActiveXObject, "undefined");
            },

            "does not expose ActiveXObject when restored": function () {
                this.fakeXhr.restore();

                assert.equals(typeof ActiveXObject, "undefined");
            }
        },

        "native ActiveXObject": {
            requiresSupportFor: {
                ActiveXObject: typeof ActiveXObject !== "undefined"
            },
            setUp: fakeXhrSetUp,
            tearDown: fakeXhrTearDown,

            "hijacks ActiveXObject": function () {
                refute.same(root.ActiveXObject, globalActiveXObject);
                refute.same(window.ActiveXObject, globalActiveXObject);
                refute.same(ActiveXObject, globalActiveXObject); // eslint-disable-line no-undef
            },

            "restores global ActiveXObject": function () {
                this.fakeXhr.restore();

                assert.same(root.ActiveXObject, globalActiveXObject);
                assert.same(window.ActiveXObject, globalActiveXObject);
                assert.same(ActiveXObject, globalActiveXObject); // eslint-disable-line no-undef
            },

            "creates FakeXHR object with ActiveX Microsoft.XMLHTTP": function () {
                var xhr = new ActiveXObject("Microsoft.XMLHTTP"); // eslint-disable-line no-undef

                assert(xhr instanceof sinon.FakeXMLHttpRequest);
            },

            "creates FakeXHR object with ActiveX Msxml2.XMLHTTP": function () {
                var xhr = new ActiveXObject("Msxml2.XMLHTTP"); // eslint-disable-line no-undef

                assert(xhr instanceof sinon.FakeXMLHttpRequest);
            },

            "creates FakeXHR object with ActiveX Msxml2.XMLHTTP.3.0": function () {
                var xhr = new ActiveXObject("Msxml2.XMLHTTP.3.0"); // eslint-disable-line no-undef

                assert(xhr instanceof sinon.FakeXMLHttpRequest);
            },

            "creates FakeXHR object with ActiveX Msxml2.XMLHTTP.6.0": function () {
                var xhr = new ActiveXObject("Msxml2.XMLHTTP.6.0"); // eslint-disable-line no-undef

                assert(xhr instanceof sinon.FakeXMLHttpRequest);
            }
        },

        "missing native XHR": {
            requiresSupportFor: { "no native XHR": typeof XMLHttpRequest === "undefined" },
            setUp: fakeXhrSetUp,
            tearDown: fakeXhrTearDown,

            "does not expose XMLHttpRequest": function () {
                assert.equals(typeof XMLHttpRequest, "undefined");
            },

            "does not expose XMLHttpRequest after restore": function () {
                this.fakeXhr.restore();

                assert.equals(typeof XMLHttpRequest, "undefined");
            }
        },

        "native XHR": {
            requiresSupportFor: {
                XHR: typeof XMLHttpRequest !== "undefined"
            },
            setUp: fakeXhrSetUp,
            tearDown: fakeXhrTearDown,

            "replaces global XMLHttpRequest": function () {
                refute.same(XMLHttpRequest, globalXMLHttpRequest);
                assert.same(XMLHttpRequest, sinon.FakeXMLHttpRequest);
            },

            "restores global XMLHttpRequest": function () {
                this.fakeXhr.restore();

                assert.same(XMLHttpRequest, globalXMLHttpRequest);
            }
        },

        "progress events": {
            setUp: function () {
                this.xhr = new sinon.FakeXMLHttpRequest();
                this.xhr.open("GET", "/some/url");
            },

            "triggers 'loadstart' event on #send": function (done) {
                this.xhr.addEventListener("loadstart", function () {
                    assert(true);

                    done();
                });

                this.xhr.send();
            },

            "triggers 'loadstart' with event target set to the XHR object": function (done) {
                var xhr = this.xhr;

                this.xhr.addEventListener("loadstart", function (event) {
                    assert.same(xhr, event.target);

                    done();
                });

                this.xhr.send();
            },

            "calls #onloadstart on #send": function (done) {
                this.xhr.onloadstart = function () {
                    assert(true);

                    done();
                };

                this.xhr.send();
            },

            "triggers 'load' event on success": function (done) {
                var xhr = this.xhr;

                this.xhr.addEventListener("load", function () {
                    assert.equals(xhr.readyState, sinon.FakeXMLHttpRequest.DONE);
                    refute.equals(xhr.status, 0);

                    done();
                });

                this.xhr.send();
                this.xhr.respond(200, {}, "");
            },

            "triggers 'load' with event target set to the XHR object": function (done) {
                var xhr = this.xhr;

                this.xhr.addEventListener("load", function (event) {
                    assert.same(xhr, event.target);

                    done();
                });

                this.xhr.send();
                this.xhr.respond(200, {}, "");
            },

            "calls #onload on success": function (done) {
                var xhr = this.xhr;

                this.xhr.onload = function () {
                    assert.equals(xhr.readyState, sinon.FakeXMLHttpRequest.DONE);
                    refute.equals(xhr.status, 0);

                    done();
                };

                this.xhr.send();
                this.xhr.respond(200, {}, "");
            },

            "does not trigger 'load' event on abort": function (done) {
                this.xhr.addEventListener("load", function () {
                    assert(false);
                });

                this.xhr.addEventListener("abort", function () {
                    assert(true);

                    // finish on next tick
                    setTimeout(done, 0);
                });

                this.xhr.send();
                this.xhr.abort();
            },

            "triggers 'abort' event on cancel": function (done) {
                var xhr = this.xhr;

                this.xhr.addEventListener("abort", function () {
                    assert.equals(xhr.readyState, sinon.FakeXMLHttpRequest.DONE);
                    assert.equals(xhr.status, 0);

                    setTimeout(function () {
                        assert.equals(xhr.readyState, sinon.FakeXMLHttpRequest.UNSENT);
                        done();
                    }, 0);
                });

                this.xhr.send();
                this.xhr.abort();
            },

            "triggers 'abort' with event target set to the XHR object": function (done) {
                var xhr = this.xhr;

                this.xhr.addEventListener("abort", function (event) {
                    assert.same(xhr, event.target);

                    done();
                });

                this.xhr.send();
                this.xhr.abort();
            },

            "calls #onabort on cancel": function (done) {
                var xhr = this.xhr;

                this.xhr.onabort = function () {
                    assert.equals(xhr.readyState, sinon.FakeXMLHttpRequest.DONE);
                    assert.equals(xhr.status, 0);

                    setTimeout(function () {
                        assert.equals(xhr.readyState, sinon.FakeXMLHttpRequest.UNSENT);
                        done();
                    }, 0);
                };

                this.xhr.send();
                this.xhr.abort();
            },

            "triggers 'loadend' event at the end": function (done) {
                this.xhr.addEventListener("loadend", function (e) {
                    assertProgressEvent(e, 0);
                    assert(true);

                    done();
                });

                this.xhr.send();
                this.xhr.respond(403, {}, "");
            },

            "triggers 'loadend' with event target set to the XHR object": function (done) {
                var xhr = this.xhr;

                this.xhr.addEventListener("loadend", function (event) {
                    assertProgressEvent(event, 100);
                    assert.same(xhr, event.target);

                    done();
                });

                this.xhr.send();
                this.xhr.respond(200, {}, "");
            },

            "calls #onloadend at the end": function (done) {
                this.xhr.onloadend = function (e) {
                    assertProgressEvent(e, 0);
                    assert(true);

                    done();
                };

                this.xhr.send();
                this.xhr.respond(403, {}, "");
            },

            "triggers (download) progress event when response is done": {
                requiresSupportFor: {
                    "ProgressEvent": supportsProgressEvents
                },
                test: function (done) {
                    this.xhr.addEventListener("progress", function (e) {
                        assert.equals(e.total, 100);
                        assert.equals(e.loaded, 20);
                        assert.isTrue(e.lengthComputable);
                        done();
                    });
                    this.xhr.downloadProgress({
                        total: 100,
                        loaded: 20
                    });
                }
            }
        },

        "xhr.upload": {
            setUp: function () {
                this.xhr = new sinon.FakeXMLHttpRequest();
                this.xhr.open("POST", "/some/url", true);
            },


            "progress event is triggered with xhr.uploadProgress({loaded: 20, total: 100})": {
                requiresSupportFor: {
                    "ProgressEvent": supportsProgressEvents
                },
                test: function (done) {
                    this.xhr.upload.addEventListener("progress", function (e) {
                        assert.equals(e.total, 100);
                        assert.equals(e.loaded, 20);
                        assert.isTrue(e.lengthComputable);
                        done();
                    });
                    this.xhr.uploadProgress({
                        total: 100,
                        loaded: 20
                    });
                }
            },

            "triggers 'load' event on success": function (done) {
                var xhr = this.xhr;

                this.xhr.upload.addEventListener("load", function () {
                    assert.equals(xhr.readyState, sinon.FakeXMLHttpRequest.DONE);
                    refute.equals(xhr.status, 0);
                    done();
                });

                this.xhr.send();
                this.xhr.respond(200, {}, "");
            },

            "fires event with 100% progress on 'load'": {
                requiresSupportFor: {
                    "ProgressEvent": supportsProgressEvents
                },

                test: function (done) {
                    this.xhr.upload.addEventListener("progress", function (e) {
                        assert.equals(e.total, 100);
                        assert.equals(e.loaded, 100);
                        done();
                    });

                    this.xhr.send();
                    this.xhr.respond(200, {}, "");
                }
            },

            "fires events in an order similar to a browser": function (done) {
                var xhr = this.xhr;
                var events = [];

                this.xhr.upload.addEventListener("progress", function (e) {
                    events.push(e.type);
                });
                this.xhr.upload.addEventListener("load", function (e) {
                    events.push(e.type);
                });
                this.xhr.addEventListener("readystatechange", function (e) {
                    if (xhr.readyState === 4) {
                        events.push(e.type);
                        if (supportsProgressEvents) {
                            assert.equals(events.splice(0, 1)[0], "progress");
                        }
                        assert.equals(events, ["load", "readystatechange"]);
                        done();
                    }
                });

                this.xhr.send();
                this.xhr.respond(200, {}, "");
            },

            "calls 'abort' on cancel": function (done) {
                var xhr = this.xhr;

                this.xhr.upload.addEventListener("abort", function () {
                    assert.equals(xhr.readyState, sinon.FakeXMLHttpRequest.DONE);
                    assert.equals(xhr.status, 0);

                    setTimeout(function () {
                        assert.equals(xhr.readyState, sinon.FakeXMLHttpRequest.UNSENT);
                        done();
                    }, 0);
                });

                this.xhr.send();
                this.xhr.abort();
            },

            "error event": {
                requiresSupportFor: {
                    CustomEvent: typeof CustomEvent !== "undefined"
                },

                "is triggered with xhr.uploadError(new Error('foobar'))": function (done) {
                    this.xhr.upload.addEventListener("error", function (e) {
                        assert.equals(e.detail.message, "foobar");

                        done();
                    });
                    this.xhr.uploadError(new Error("foobar"));
                }
            },

            "event listeners can be removed": function () {
                var callback = function () {};
                this.xhr.upload.addEventListener("load", callback);
                this.xhr.upload.removeEventListener("load", callback);
                assert.equals(this.xhr.upload.eventListeners.load.length, 0);
            }
        }
    });
}(this));
