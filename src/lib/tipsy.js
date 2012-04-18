(function(){
var tipsysDisposeByGroup = {}; 

function addTipsy(dispose, group) {
    var tipsysGroup = tipsysDisposeByGroup[group] || (tipsysDisposeByGroup[group] = []);
    tipsysGroup.push(dispose);
}

function disposeGroup(group) {
    var tipsysGroup = tipsysDisposeByGroup[group];
    if(tipsysGroup && tipsysGroup.length) {
        tipsysGroup.forEach(function(dispose){
            dispose();
        });
        
        tipsysGroup.length = 0;
    }
}

pv.Behavior.tipsy = function(opts) {
    /**
     * One tip is reused per behavior instance.
     * Tipically there is one behavior instance per mark,
     * and this is reused across all its mark instances.
     */
    var tip,
        tipMark,
        group = opts && opts.exclusionGroup,
        usesPoint = opts && opts.usesPoint,
        rootPanel = opts && opts.rootPanel,
        $mouseleaveTarget;
    
    /**
     * @private When the mouse leaves the root panel, trigger a mouseleave event
     * on the tooltip span. This is necessary for dimensionless marks (e.g.,
     * lines) when the mouse isn't actually over the span.
     */
    function removeTipsy() {
        if(group) {
            //pvc.log('Disposing tipsy group #' + (tipsysDisposeByGroup[group] && tipsysDisposeByGroup[group].length));
            disposeGroup(group);
        } else {
            disposeTipsy();
        }
    }
    
    function disposeTipsy() {
        //pvc.log('Disposing tipsy');
        // Do not leak memory
        if($mouseleaveTarget) {
            $mouseleaveTarget.unbind('mouseleave', removeTipsy);
            $mouseleaveTarget = null;
        }
        
        if (tip) {
            $(tip).tipsy("hide");
            if(tip.parentNode) {
                tip.parentNode.removeChild(tip);
            }
            tip = null;
            tipMark = null;
            startTooltip.tipMark = null;
        }
    }
    

    function followMouseMoveAbs(ev){
        // TODO: with Dots, only works well if gravity is set to "c"...
        if(tip) {
            var tipLbl = $(tip).tipsy("tip"),
                extra = 8,//px
                x,
                y;

            // Prevent being cropped by window
            if(ev.clientX + extra + tipLbl.width() > document.body.clientWidth){
                x = ev.pageX - extra - tipLbl.width();
            } else {
                x = ev.pageX + extra;
            }

            if(ev.clientY + extra + tipLbl.height() > document.body.clientHeight){
                y = ev.pageY - extra - tipLbl.height();
            } else {
                y = ev.pageY + extra;
            }

            tipLbl.css('left', x + "px");
            tipLbl.css('top',  y + "px");
        }
    }

    function toParentTransform(parentPanel){
        return pv.Transform.identity.
                    translate(parentPanel.left(), parentPanel.top()).
                    times(parentPanel.transform());
    }

    function toScreenTransform(parent){
        var t = pv.Transform.identity;
        do {
            t = t.translate(parent.left(), parent.top())
                 .times(parent.transform());
        } while ((parent = parent.parent));

        return t;
    }

    function getVisibleScreenBounds(mark){

        var left   = mark.left(),
            top    = mark.top(),
            width  = mark.width(),
            height = mark.height(),
            right,
            bottom,
            parent;

        while ((parent = mark.parent)){

            // Does 'mark' fit in its parent?
            if(left < 0){
                width += left;
                left = 0;
            }

            if(top < 0){
                height += top;
                top = 0;
            }

            right  = mark.right();
            if(right < 0){
                width += right;
            }

            bottom = mark.bottom();
            if(bottom < 0){
                height += bottom;
            }

            // Transform to parent coordinates
            var t = toParentTransform(parent),
                s = t.k;

            left   = t.x + (s * left);
            top    = t.y + (s * top );
            width  = s * width;
            height = s * height;

            mark = parent;
        }

        return {
            left:   left,
            top:    top,
            width:  width,
            height: height
        };
    }

    function startTooltip(d) {
        /* Create and cache the tooltip span to be used by tipsy. */
        if (!tip) {
            var c = this.root.canvas();
            c.style.position = "relative";
            
            var rootElem = rootPanel && rootPanel.scene && rootPanel.scene.$g;
            if(rootElem) {
                //$(rootElem).mouseleave(removeTipsy);
            } else {
                $(c).mouseleave(removeTipsy);
            } 
            
            tip = c.appendChild(document.createElement("div"));
            tip.style.position = "absolute";
            tip.style.pointerEvents = "none"; // ignore mouse events
            $(tip).tipsy(opts);
            
            if(group) {
                disposeGroup(group);
                addTipsy(disposeTipsy, group);
            }
        }

        tipMark = this;
        startTooltip.tipMark = this;

        /* Find the tooltip text. */
        var instance = this.instance();
        var title = (instance && instance.tooltip) ||
                    (typeof this.tooltip == 'function' && this.tooltip()) ||
                     this.title() ||
                     this.text();
         
        // Allow deferred tooltip creation! 
        if(typeof title === 'function') {
            title = title();
        }
        
        tip.title = title || ""; // Prevent "undefined" from showing up
        
        /*
         * Compute bounding box. TODO support area, lines, wedges, stroke. Also
         * note that CSS positioning does not support subpixels, and the current
         * rounding implementation can be off by one pixel.
         */
        var left, top;
        if (this.properties.width) {
            // Bar
            var bounds = getVisibleScreenBounds(this);
            
            left = Math.floor(bounds.left);
            top  = Math.floor(bounds.top );

            tip.style.width  = (Math.ceil(bounds.width ) + 1) + "px";
            tip.style.height = (Math.ceil(bounds.height) + 1) + "px";

        } else {
            /* Compute the transform to offset the tooltip position. */
            var t = toScreenTransform(this.parent);
            
            if(this.properties.outerRadius){
                // Wedge
                var angle = this.endAngle() - this.angle()/2;
                var radius = this.outerRadius() - (this.outerRadius() - this.innerRadius())*0.3;
                left = Math.floor(this.left() + Math.cos(angle)*radius + t.x);
                top  = Math.floor(this.top()  + Math.sin(angle)*radius + t.y);
            } else {
                left = Math.floor(this.left() * t.k + t.x);
                top  = Math.floor(this.top()  * t.k + t.y);
            }
        }

        tip.style.left = left + "px";
        tip.style.top  = top  + "px";

        //} else if (this.properties.shapeRadius && !opts.followMouse) {
        //  var r = this.shapeRadius();
        //  t.x -= r;
        //  t.y -= r;
        //  tip.style.height = tip.style.width = Math.ceil(2 * r * t.k) + "px";

        if(opts.followMouse){
           $(pv.event.target).mousemove(followMouseMoveAbs);
        }
        
        /*
         * Cleanup the tooltip span on mouseout.
         * This is necessary for dimensionless marks.
         *
         * Note that the tip has pointer-events disabled
         * (so as to not interfere with other mouse events, such as "click");
         * thus the mouseleave event handler is registered on
         * the event target rather than the tip overlay.
         */
        if(usesPoint){
            // Being used as a point handler
            // Should remove the tipsy only in the unpoint event
            this.event('unpoint', removeTipsy);
        } else {
            if($mouseleaveTarget) {
                $mouseleaveTarget.unbind('mouseleave', removeTipsy);
            }
            $mouseleaveTarget = $(pv.event.target); 
            $mouseleaveTarget.mouseleave(removeTipsy);
        }

        $(tip).tipsy("show");
    }

    return startTooltip;
};

}());