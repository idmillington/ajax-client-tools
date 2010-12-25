/*
 * Egality - a library for managing Ajax retrieved data.
 */

/*
 * Creates a new manager for the given set of data.
 */
var Egality = function(specification) {
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
Egality.mutators = {
    /*
     * Records can store anything, the new value just replace the old.
     */
    record: function(object, field, value, update) {
        var previous = object[field];
        object[field] = value;
        if (update) update(value, previous);
    },

    /*
     * New values passed in get added (or replace) existing ones with the 
     * same name.
     */
    library: function(object, field, value, update) {
        var current = object[field];
        var data = value.data
        var fieldsChanged = [];
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
     * Lists can page in sets of data, based on a given index. The value
     * may have an index field, as well as its data, in which case it 
     * starts setting the list data from that given index. Note that lists
     * don't support removal or reordering.
     */
    list: function(object, field, value, update) {
        var current = object[field];
        var index = value.index || 0;
        var array = value.data;
        for (var i = 0; i < array.length; i++) {
            current[i + index] = array[i];
        }
        object[field] = current;
        if (update) update(index, index + array.length - 1);
    }
};

/*
 * Sets the value of the given field, in accordance with its specification.
 * This is usually done based on incoming data.
 */
Egality.prototype.set = function(field, value) {
    // Set the value and notify any update.
    var spec = this._specification[field];
    var mutate = Egality.mutators[spec.type];
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
 * Makes sure that the expiry data, and its corresponding timeout, are valid
 * for the current state of the expiry in the specifications (i.e. you only 
 * need to modify the specification). This could be made more efficient if 
 * we did some of this incrementally as the data changes, but typically the 
 * cost of an expiry (i.e. an Ajax request) is so much more than the sorting 
 * and traversing we do here, it isn't worth it.
 */
Egality.prototype._validateExpiry = function() {
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

    // See if we need to process any items at the head of the sequence.
    this._processExpired();
};

/*
 * This is called when the timer discovers that a field's value has expired.
 */
Egality.prototype._processExpired = function() {
    var expiryData;
    var now = (new Date().valueOf()) * 0.001;

    // Notify each elapsed element in the sequence that it is being expired.
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
        // Check if the current timer is still okay for this sequence.
        var first = this._expirySequence[0];
        if ( !! this._timer.expires || this._timer.expires > first.expires) {
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
 * Retrieves the value of the given field. Note that you can also do
 * this.field to get the value. You *could* also set the value the
 * same way, but that would totally circumvent all the logic of the
 * class.
 */
Egality.prototype.get = function(field) {
    return this[field];
};


// Test
var e = new Egality({
    world: {
        // Records will be completely replaced when they are set.
        type: 'record',
        update: function() {},
    },
    character: {
        type: 'record',
        // This is called when the value changes.
        update: function() {},
        // This is called when the field has expired.
        expired: function() {},
        // How many seconds between calls to tick for this property.
        frequency: 0.25,
        // This is called at the given frequency.
        tick: function() {}
    },
    quality_definitions: {
        type: 'library',
    },
    qualities: {
        type: 'library',
        update: function() {}
    },
    transactions: {
        type: 'list'
    },
});
