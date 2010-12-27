/**
 * A declarative template system for javascript with jquery.
 */
 
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
            for (var i = 0; i < array.length; i++) newArray.push(array[i]);
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
    
    // Insert data from the given data structure recursively into the given 
    // element.
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
                $element.attr('class', cssValue+' '+$element.attr('class'));
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