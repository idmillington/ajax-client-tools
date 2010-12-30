/*
 * Egality - a library for managing Ajax retrieved data.
 */
(function() {

    // ---------------------------------------------------------------------
    // A data storage, and timed expiry system.
    // ---------------------------------------------------------------------

    /*
     * Creates a new manager for the given set of data.
     */
    var DataStore = function(specification) {
        this._specification = specification

        // Create data for data-expiry.
        this._expirySequence = [];
        this._timer = {
            expires: null,
            handle: null
        };

        // The tick information, indexed by frequency.
        this._ticks = {};

        // Create the records for each field with null as initial data.
        var spec;
        for (var field in specification) {
            this[field] = null;

            spec = specification[field]
            if (spec.tick) {
                if (this._ticks[spec.frequency]) {
                    this._ticks[spec.frequency].push(field);
                } else {
                    this._ticks[spec.frequency] = [field];
                }
            }
        }

        // Start all our tickers off.
        var that = this;
        for (var frequency in this._ticks) {
            (function(frequency, fields) {
                setInterval(function() {
                    var now = (new Date().valueOf()) * 0.001;
                    for (var i = 0; i < fields.length; i++) {
                        var spec = that._specification[field];
                        spec.tick(spec.expires);
                    }
                },
                frequency * 1000);
            })(frequency, this._ticks[frequency]);
        }
    };

    /*
     * Setting a field is managed by a helper function.
     */
    DataStore.mutators = {
        /*
         * Records can store anything, the new value just replace the
         * old.
         */
        record: function(object, field, value, update) {
            var previous = object[field];
            object[field] = value;
            if (update) update(value, previous);
        },

        /*
         * New values passed in get added (or replace) existing ones
         * with the same name.
         */
        library: function(object, field, value, update) {
            var current = object[field],
                data = value.data,
                fieldsChanged = [];
            for (var field in data) {
                var val = data[field];
                // An incoming value of 'null' tells us to delete the
                // current record at that field.
                if (val === null) {
                    if (current[field] !== undefined) {
                        delete current[field];
                    }
                } else {
                    current[field] = val;
                }

                fieldsChanged.push(field);
            }
            object[field] = current;
            if (update) update(fieldsChanged);
        },

        /*
         * Lists can page in sets of data, based on a given index. The
         * value may have an index field, as well as its data, in which
         * case it starts setting the list data from that given
         * index. Note that lists don't support removal or reordering.
         */
        list: function(object, field, value, update) {
            var current = object[field],
                index = value.index || 0,
                array = value.data;
            for (var i = 0; i < array.length; i++) {
                current[i + index] = array[i];
            }
            object[field] = current;
            if (update) update(index, index + array.length - 1);
        }
    };

    /*
     * Sets the value of the given field, in accordance with its
     * specification.  This is usually done based on incoming data.
     */
    DataStore.prototype.set = function(field, value) {
        // Set the value and notify any update.
        var spec = this._specification[field],
            mutate = DataStore.mutators[spec.type];
        mutate(this, field, value, spec.update);

        // See if we have an expiry.
        if (value.expires > 0) {
            // Calculate the time until this expires.
            var now = (new Date().valueOf()) * 0.001;
            spec.expires = now + value.expires;
        } else if (spec.expires !== undefined) {
            // We used to, but we're removing it.
            delete spec.expires;
        }

        // Make sure we're up to date with all our expiry data.
        this._validateExpiry();
    };

    /**
     * Makes sure that the expiry data, and its corresponding timeout,
     * are valid for the current state of the expiry in the
     * specifications (i.e. you only need to modify the
     * specification). This could be made more efficient if we did
     * some of this incrementally as the data changes, but typically
     * the cost of an expiry (i.e. an Ajax request) is so much more
     * than the sorting and traversing we do here, it isn't worth it.
     */
    DataStore.prototype._validateExpiry = function() {
        // Recompile the sequence
        this._expirySequence = [];
        for (var field in this._specification) {
            var spec = this._specification[field];
            // Add to the list only if we have a live expiry.
            if (spec.expires !== undefined) {
                this._expirySequence.push({
                    field: field,
                    expires: spec.expires
                });
            }
        }
        this._expirySequence.sort(function(a, b) {
            return a.expires - b.expires;
        });

        // See if we need to process any items at the head of the
        // sequence.
        this._processExpired();
    };

    /*
     * This is called when the timer discovers that a field's value
     * has expired.
     */
    DataStore.prototype._processExpired = function() {
        var expiryData,
            now = (new Date().valueOf()) * 0.001;

        // Notify each elapsed element in the sequence that it is being
        // expired.
        for (; this._expirySequence.length > 0;) {
            expiryData = this._expirySequence[0];
            if (expiryData.expires <= now) {
                var spec = this._specification[expiryData.field];

                // Remove the expiry data.
                delete spec.expires;
                this._expirySequence.splice(0, 1);

                // Try to notify the field that it has expired.
                if (spec.expired) spec.expired();
            } else {
                // We've found an item in the future, so stop looking.
                break;
            }
        }

        // Make the timer expire at the correct time.
        if (this._expirySequence.length) {
            // Check if the current timer is still okay for this
            // sequence.
            var first = this._expirySequence[0];
            if (!this._timer.expires || this._timer.expires > first.expires) {
                // The current timer will expire too late, reset it.
                if (this._timer.handle) clearTimeout(this._timer.handle);
                this._timer.handle = setTimeout(function() {
                    this._processExpired();
                },
                (first.expires - now) * 1000);
                this._timer.expires = first.expires;
            }
        } else {
            // Make sure we haven't got a timer running.
            if (this._timer.handle) {
                clearTimeout(this._timer.handle);
                this._timer.handle = null;
                this._timer.expires = null;
            }
        }
    };

    /*
     * Retrieves the value of the given field. Note that you can also
     * do this.field to get the value. You *could* also set the value
     * the same way, but that would totally circumvent all the logic
     * of the class.
     */
    DataStore.prototype.get = function(field) {
        return this[field];
    };

    // ---------------------------------------------------------------------
    // A declarative template system for javascript with jquery.
    // ---------------------------------------------------------------------

    /**
     * Puts the given data into the marked locations in the given dom.
     */
    var merge = function(dom, data) {

        // Dispatches the value for processing, based on its type.
        var process = function(element, value, inObject) {
            var $element = $(element);

            if (value === undefined || value === null) {
                // Ignore
            } else if (typeof value == 'object') {
                switch (value.constructor) {
                case Array:
                    processArray(element, value);
                    break;
                case Object:
                    if (inObject) {
                        $element.children().each(function() {
                            processObject(this, value);
                        });
                    } else {
                        processObject(element, value);
                    }
                    break;
                default:
                    break;
                }
            } else {
                $element.html(value);
            }
        };

        // Merges the given array of data into the given element.
        var processArray = function(element, array) {
            var $element = $(element);
            $element.empty();
            if (array.length <= 0) return;

            var sort = $element.attr('data-sort');
            if (sort) {
                // Take an array copy and sort it.
                var newArray = []
                for (var i = 0; i < array.length; i++) {
                    newArray.push(array[i]);
                }
                newArray.sort(function(a, b) {
                    if (a[sort] < b[sort]) return -1;
                    else if (a[sort] > b[sort]) return 1;
                    else return 0;
                });
                array = newArray;
            }

            // Find the item we're going to repeat for each child.
            var template = $($element.attr('data-item'));
            for (var i = 0; i < array.length; i++) {
                var datum = array[i];
                var item = template.clone().removeAttr('id');
                process(item, datum);
                $element.append(item);
            }
        };

        // Insert data from the given data structure recursively into
        // the given element.
        var processObject = function(element, data) {
            var $element = $(element);

            // Add any fields.
            var field = $element.attr('data-field');
            if (field) {
                var value = data[field];
                process(element, value, true);
            } else {
                // Recurse into the children of this element.
                $element.children().each(function() {
                    processObject(this, data);
                });
            }

            // Add any css-classes.
            var css = $element.attr('data-classes');
            if (css) {
                var cssValue = data[css];
                if (cssValue) {
                    $element.attr(
                        'class', cssValue + ' ' + $element.attr('class')
                    );
                }
            }

            // Show or hide based on a value.
            var show = $element.attr('data-show');
            if (show) {
                $element.toggle(data[show]);
            }
        };

        $(dom).each(function() { process(this, data); });
    };

    // ---------------------------------------------------------------------
    // A paged content manager.
    // ---------------------------------------------------------------------

    /**
     * Manage paged content in an Ajax web interface.
     */
    var PageManager = function(structure, start) {
        this.structure = structure;
        this.currentHash = window.location.hash;

        // Find where to start.
        this._view(this._hash2view(this.currentHash));

        // Listen for hash changes made directly (or through history
        // nav).
        var that = this;
        setInterval(function() {
            var newHash = window.location.hash,
                newView = newHash.substring(1);
            if (newView != that.currentView) {
                that._view(newView);
            }
        }, 250);

        // And shortcut that process if we have a click.
        $('a[href^="#"]').click(function(event) {
            // We explicitly do this (even though returning false), in
            // case the _view method throws an error (hich it will if
            // the prepare function throws one).
            event.preventDefault();
            event.stopPropagation();
            var newHash = $(this).attr('href'),
                newView = newHash.substring(1);
            if (newView != that.currentView) {
                that._view(newView);
            }
            return false;
        });
    }

    PageManager.prototype._hash2view = function(hash) {
        var trimmed = hash.substring(1);
        if (trimmed == "" || this.structure[trimmed] == undefined) {
            return this.structure._start;
        } else {
            return trimmed;
        }
    };

    PageManager.prototype._view2hash = function(view) {
        if (view == "" || this.structure[view] == undefined) {
            return "#"+this.structure._start;
        } else {
            return "#"+view;
        }
    };

    PageManager.prototype._view = function(showView) {
        // Make sure we have this view.
        var viewData = this.structure[showView];
        if (this.currentView == showView) return;
        if (viewData === undefined) {
            window.location.hash = this.currentHash;
            return;
        }

        // Hide the elements we're removing.
        var display = viewData.display;
        if (typeof display == 'function' ||
            (typeof display == 'object' && display.constructor == Function)) {
            display();
        } else {
            $(display.hide).hide();
            $(display.show).show();
        }

        // Change the URL hash.
        this.currentView = showView;
        if (this._hash2view(window.location.hash) != showView) {
            window.location.hash = this.currentHash =
                this._view2hash(showView);
        }

        // The complete function finishes off merging the content, if
        // required.
        var complete;
        if (viewData.content) {
            complete = function() {
                // Store the original content, if we have it. This
                // will be used pre-preparation from now on. It is
                // usually a loading message.
                if (viewData.originalContent === undefined) {
                    viewData.originalContent =
                        $(viewData.content.target).html();
                }

                // Write in the new content.
                var content =
                    $(viewData.content.source).clone().removeAttr('id');
                $(viewData.content.target).html(content);
            };
        }

        // Run the prepare function before completing.
        if (viewData.prepare) {
            // Before we prepare, set the original content (usually a
            // loading msg).
            if (viewData.originalContent !== undefined) {
                $(viewData.content.target).html(viewData.originalContent);
            }
            // Prepare the new data and write it.
            viewData.prepare(function() {
                if (complete) complete();
            });
        } else if (complete) {
            // Just write the new content.
            complete();
        }
    };

    // ---------------------------------------------------------------------
    // Bookkeeping.
    // ---------------------------------------------------------------------

    // Expose the bits we want to expose.
    window.revolution = {
        DataStore: DataStore,
        merge: merge,
        PageManager: PageManager
    };
})();
