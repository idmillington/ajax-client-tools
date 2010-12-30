/**
 * Manage paged content in an Ajax web interface.
 */
var Fraternity = function(structure, start) {
    this.structure = structure;
    this.currentHash = window.location.hash;
    
    // Find where to start.
    this._view(this._hash2view(this.currentHash));
    
    // Listen for hash changes made directly (or through history nav).
    var that = this;
    setInterval(function() {
        var newHash = window.location.hash;
        var newView = newHash.substring(1);
        if (newView != that.currentView) {
            that._view(newView);
        }
    }, 250);
    
    // And shortcut that process if we have a click.
    $('a[href^="#"]').click(function(event) {
        // We explicitly do this (even though returning false), in case the
        // _view method throws an error (hich it will if the prepare function
        // throws one).
        event.preventDefault();
        event.stopPropagation();
        var newHash = $(this).attr('href');
        var newView = newHash.substring(1);
        if (newView != that.currentView) {
            that._view(newView);
        }
        return false;
    });
}

Fraternity.prototype._hash2view = function(hash) {
    var trimmed = hash.substring(1);
    if (trimmed == "" || this.structure[trimmed] == undefined) {
        return this.structure._start;
    } else {
        return trimmed;
    }
};

Fraternity.prototype._view2hash = function(view) {
    if (view == "" || this.structure[view] == undefined) {
        return "#"+this.structure._start;
    } else {
        return "#"+view;
    }
};

Fraternity.prototype._view = function(showView) {
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
        window.location.hash = this.currentHash = this._view2hash(showView);
    }
    
    // The complete function finishes off merging the content, if required.
    var complete;
    if (viewData.content) {
        complete = function() {
            // Store the original content, if we have it. This will be used
            // pre-preparation from now on. It is usually a loading message.
            if (viewData.originalContent === undefined) {
                viewData.originalContent = $(viewData.content.target).html();
            }
            
            // Write in the new content.
            var content = $(viewData.content.source).clone().removeAttr('id');
            $(viewData.content.target).html(content);
        };
    }

    // Run the prepare function before completing.
    if (viewData.prepare) {
        // Before we prepare, set the original content (usually a loading msg).
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

