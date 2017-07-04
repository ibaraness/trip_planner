//TODO: Load content data from server

/**
 * The main namespace of the trip planner wizard
 */
var TripWizard = {}

/**
 * A very simple immutable state manager
 * * Dependencies: jQuery, _(underscore)
 */
TripWizard.stateManager = (function($, _){
	var _state = {}

	/**
	 * Handles checkbox changes
	 */
	function _handleCheckBox(target){
		if(target.getAttribute('type') === 'checkbox'){
			var group = target.parentNode.parentNode.getAttribute('data-subject') || 'unknown_group';
			_state[group] = _state[group] || {};

			if(!target.checked){
				_state[group] = _.omit(_state[group], target.getAttribute('id'));
				return;
			}

			var newEntry = {};
			newEntry[target.getAttribute('id')] = true;
			_state[group] = _.extend(newEntry, _state[group]);
		}
	}

	/**
	 * Handle text input changes
	 */
	function _handleTextInput(target){
		var newEntry = {};
		newEntry[target.getAttribute('id')] = target.value;
		_state = _.extend(_.clone(_state), newEntry);
	}

	$(document).on('change', '.trip-wizard-modal input', function(event){
		var inputType = event.target.getAttribute('type');
		if(inputType === 'checkbox'){
			_handleCheckBox(event.target);
		}
		if(inputType === 'text'){
			_handleTextInput(event.target);
		}
	});

	return {
		getState:function(){
			return _.clone(_state);
		}
	}

}(jQuery, _));

/**
 * Handle low level template functionality
 * Dependencies: jQuery, _(underscore)
 */
TripWizard.contentManager = (function($, _){

	if(!$){
		throw 'jQuery was not loaded!';
	}

	if(!_){
		throw 'Underscore was not loaded!';
	}

	/**
	 * Get an Underscore template usings id name
	 * @param  {string} templateId  - The template ID as set in the html
	 * @return {function}           - An underscore partial template function.
	 *                                When later passing an object with values to that function
	 *                                we will get an HTML string of our template with our values.
	 */
	function _getTemplate(templateId){
		var templateHTML = $('#' + templateId).html() || "";
		return _.template(templateHTML);
	}

	/**
	 * Get a list of 'option' tags for range of number, like 1-10 etc.
	 * @param  {number} from - The range 'from' value (like the 1 from 1-10)
	 * @param  {number} to   - The range 'to' valte (like the 10 from 1-10)
	 * @return {[string}      - A string containing the html;
	 */
	function _getSelectOptionsNumberRange(from, to){
		if(_.isNaN(from) || _.isNaN(to)){
			throw '\'from\' or \'to\' param is not a number';
		}
		var $select = $('<select/>');
		for(var i = from, len = ++to; i < to; i++){
			var element = $('<option/>',{'value':i, 'text':i});
			$($select).append(element);
		}
		return $select.html();
	}

	/**
	 * Get a list of 'option' tags for range of number, like 1-10 etc.
	 * @param  {array} settingsList - An array of objects, with the checkbox input, and the label tags properties
	 * @return {[string}      - A string containing the html;
	 */
	function _getCheckboxGridList(settingsList){
		if(!_.isArray(settingsList)){
			throw '\'settingsList\' is not an array';
		}
		var $ul = $('<ul/>');
		for(var i = 0, len = settingsList.length; i < len; i++){
			var $checkBok = $('<input/>',{type:'checkbox', name:settingsList[i].id, id:settingsList[i].id});
			var $label = $('<label/>',{for:settingsList[i].id, text:settingsList[i].label});
			var $element = $('<li/>').append($checkBok, $label);
			$($ul).append($element);
		}
		return $ul.html();
	}

	/**
	 * Get an HTML select form group with a range of numbers (like 1-10)
	 * @param  {Underscore template function} template - !Important. we pass it in the when creating the partial 
	 *                              					using underscore partial function.
	 * @param  {number} from - The range 'from' value (like the 1 from 1-10)
	 * @param  {number} to   - The range 'to' valte (like the 10 from 1-10)
	 * @param  {[type]} id   - The select namd and id
	 * @param  {[type]} label- The label text
	 * @return {HTML string}          - A ready to implement HTML string
	 */
	var _createNumberRangeFormGroup = _.partial(function(template, from, to, id, label){
		var settings = {
			component_id:id,
			label:label,
			options: _getSelectOptionsNumberRange(from, to)
		};
		return template(settings);
	}, _getTemplate('trip-wizard-modal-select'))

	return {
		getNumberRangeSelect:function(from, to, id, label){
			return _createNumberRangeFormGroup(from, to, id, label);
		},
		getCheckboxGridList:function(settingsList){
			return _getCheckboxGridList(settingsList);
		},
		getTemplate: function(templateId){
			return _getTemplate(templateId);
		}
	};
}(jQuery, _));

/**
 * Fetch modal steps
 */
TripWizard.stepsManager = (function($, contentManager, _, stateManager){
	/**
	 * Will hold the index of the current step we are in 
	 */
	var _currentStep = 0;

	/**
	 * Will hold a list of widgets to be activated on the different templates
	 */
	var _widgets = {}

	/**
	 * An array of objects, where each object represents a step.
	 * Each step has a mandatory properties which are:
	 * - templateId: A string id to the actual underscore template.
	 * - dataReady: A boolean flag, that tells the parser(_getCurrentStep) if the data is ready.
	 * 				We use it here to check if dynamic content was generated (using generator function).
	 * The step object can have custom properties, which are usually the template content parameters.
	 * Each custom property must have a 'type' and a 'value' properties.
	 * - type: 	currently type has 3 available options: 'simple', 'generator' or 'widget' options.
	 * 			A 'simple' type has no complex mechanism, and only the 'value' property has 
	 * 			any importnat here - The template will use the raw value content as is.
	 * 			A 'generator' type marks the object as data to be generated using different content 
	 * 			generators. When using the generator as a type, additional properties needs to be set:
	 *    		- generator: The generator function name
	 *    		- params: An array of parameters to be passed to the generator function.
	 *    		
	 * The use of generator type was set instead of directly passing functions in order to be able to serialize
	 * the data, so it can be fetched from the server if we like.			
	 */
	var _contentData = [
		{
			templateId:'trip-step1',
			dataReady:false,
			from_date:{
				type:'widget',
				value:'#from_date',
				widget:'datepicker'
			},
			to_date:{
				type:'widget',
				value:'#to_date',
				widget:'datepicker'
			},
			numOfAdults: {
				type:'generator',
				params:[0, 30, 'numOfAdults', 'Adults'],
				value:'',
				generator:'getNumberRangeSelect'
			},
			numOfChildren: {
				type:'generator',
				params:[0, 30, 'numOfChildren', 'Children'],
				value:'',
				generator:'getNumberRangeSelect'
			}
		},
		{
			templateId:'trip-step3',
			dataReady:false,
			tripStyleList: {
				type:'generator',
				params:[
					[
						{
							id:'shopping', label:'Shopping'
						},
						{
							id:'beaches', label:'Beaches'
						},
						{
							id:'nature', label:'Nature'
						},
						{
							id:'history', label:'History'
						},
						{
							id:'backpacking', label:'Backpacking'
						},
						{
							id:'hiking', label:'Hiking'
						},
						{
							id:'ski', label:'Ski'
						},
						{
							id:'rest', label:'Rest'
						},
						{
							id:'resort', label:'Resort'
						},
						{
							id:'family', label:'Family'
						},
						{
							id:'seniors', label:'Seniors'
						},
						{
							id:'guided', label:'Guided'
						},
						{
							id:'parks', label:'Parks'
						}
					]
				],
				value:'',
				generator:'getCheckboxGridList'
			}
		},
		{
			templateId:'trip-step2',
			dataReady:false,
			geographicalRegionsList: {
				type:'generator',
				params:[
					[
						{
							id:'all', label:'All',
						},
						{
							id:'europ', label:'Europ'
						},
						{
							id:'north_america', label:'North America'
						},
						{
							id:'south_america', label:'South America'
						},
						{
							id:'central_america', label:'Central America'
						},
						{
							id:'africa', label:'Africa'
						},
						{
							id:'asia', label:'Asia'
						},
						{
							id:'pacific', label:'Pacific Rim'
						},
						{
							id:'arctic', label:'Arctic Region'
						}
					]
				],
				value:'',
				generator:'getCheckboxGridList'
			}
		}
	];

	/**
	 * A helper function, that runs callback functions in a step object.
	 * @param  {object} obj - The original step object to run it's data callback methods.
	 * @return {object}     - We return a new object to avoid side effects of immulating the existing one.
	 */
	function _activateDataGeneratorsAndWidgets(obj){
		var newObj = {};
		for(var pkey in obj){
			var property = obj[pkey];
			if(_.isObject(property) && !_.isArray(property)){
				if(property.type === 'generator'){
					if(typeof contentManager[property.generator] === 'function'){
						newObj[pkey] = {
							value: contentManager[property.generator].apply(null, property.params || [])
						};
						continue;
					}
				}
				if(property.type === 'widget'){
					//Add the widget to the widget list of this template
					_widgets[obj.templateId] = _widgets[obj.templateId] || [];
					_widgets[obj.templateId].push({selector: property.value, widget: property.widget});
					continue;
				}
				
			}
			newObj[pkey] = property;
		}
		newObj.dataReady = true;
		return newObj;
	}

	/**
	 * When HTML is being updated, initialize any jQuery widgets (like datepicker etc.)
	 */
	function _runWidgetsWhenReady(){
		var templateWidgets = _widgets[_contentData[_currentStep].templateId];
		if(templateWidgets){
			
			for(var i = 0, len = templateWidgets.length; i < len; i++){
				if($(templateWidgets[i].selector)[0] !== undefined){
					$(templateWidgets[i].selector)[templateWidgets[i].widget]();
				}
			}
		}
	}

	/**
	 * Fetch the saved values from the state and add them back to the correct fields
	 */
	function _updateFields(){
		var subject = $('.js-trip-wizard-data-subject').attr('data-subject');
		var subjectItems = subject !== undefined?stateManager.getState()[subject]:null;
		if(subjectItems){
			for(var item in subjectItems){
				$('#' + item).prop('checked', true);
			}
		}else {
			$('.trip-wizard-modal input').each(function(){
				var stateValue = stateManager.getState()[this.getAttribute('id')]
				if(stateValue){
					this.value = stateValue;
				}
			})
		}
	}

	/**
	 * Being called whenever the HTML is being updates with new step
	 */
	function _changed(){
		_updateFields()
		_runWidgetsWhenReady();
	}

	function _showErrorMessage(message){
		$('.js-trip-wizard-modal-error').empty().text(message).show();
	}

	function _hideErrorMessage(){
		$('.js-trip-wizard-modal-error').hide();
	}

	function _validate(){
		var $fromDate = $('#from_date'), $toDate = $('#to_date'), $checkBoxes = $('.js-trip-wizard-data-subject'), checkboxes = 0;
		if($fromDate.length > 0){
			if($fromDate.val() === ''){
				_showErrorMessage('You must choose date range!');
				return false;
			}
		}
		if($toDate.length > 0){
			if($toDate.val() === ''){
				_showErrorMessage('You must choose date range!');
				return false;
			}
		}
		if($checkBoxes.length > 0){
			$checkBoxes.find('input').each(function(){
				checkboxes += +this.checked;
			});
			if(checkboxes === 0){
				_showErrorMessage('You must check at least one checkbox!');
				return false;
			}
		}
		_hideErrorMessage();
		return true;
	}

	function _getCurrentStep(){
		//A conditional operator to get the correct data
		var data = _contentData[_currentStep] = (_contentData[_currentStep].dataReady)?_contentData[_currentStep]
												:_activateDataGeneratorsAndWidgets(_contentData[_currentStep]);

		return contentManager.getTemplate(data.templateId)(data); 
	}

	function _setStepIndex(stepNumber){
		if(!_.isNaN(stepNumber) && stepNumber < _contentData.length && stepNumber >= 0){
			_currentStep = stepNumber;
			return true;
		}
		return null;
	}

	function _getNextStep(){
		_currentStep = ++_currentStep < _contentData.length?_currentStep:--_currentStep;
		return _getCurrentStep();
	}

	function _getPreviousStep(){
		_currentStep = --_currentStep >= 0?_currentStep:++_currentStep;
		return _getCurrentStep();
	}

	function _getGroup(groupName, wrapperElement){
		var groupItems = stateManager.getState()[groupName] || {};
		var groupItemsHTML = '';
		for(var item in groupItems){
			groupItemsHTML += wrapperElement && '<' + wrapperElement + '>' + item + '</' + wrapperElement + '>' || item ;
			console.log('groupItemsHTML', groupItemsHTML)
		}
		return groupItemsHTML;
	}

	function _getWizardResults(){
		var styles = _getGroup('trip_styles', 'li'), geographical = _getGroup('geographical_region', 'li');

		return contentManager.getTemplate('wizard-result')({
			from_date: stateManager.getState()['from_date'] || '',
			to_date: stateManager.getState()['to_date'] || '',
			trip_styles:styles,
			geographical_region:geographical
		});
	}

	return {
		getCurrentStep: function(){
			return _getCurrentStep();
		},
		getNextStep:function(){
			return _getNextStep();
		},
		getPreviousStep:function(){
			return _getPreviousStep();
		},
		setStepIndex:function(stepNumber){
			return _setStepIndex(stepNumber);
		},
		hasPrevious: function(){
			return _currentStep > 0;
		},
		hasNext: function(){
			return _currentStep < (_contentData.length - 1);
		},
		stepChanged: function(){
			_changed();
		},
		getResults:function(){
			return _getWizardResults();
		},
		validate:function(){
			return _validate();
		}
	}

}(jQuery, TripWizard.contentManager, _, TripWizard.stateManager));


/**
 * An IIFE that handle the modal functionality
 * @param  {[jQuery} $ - The actual jQuery libaray
 */
(function($, stepsManager){
	"use strict";

	if(!$) {
		throw 'jQuery was not loaded!';
	}

	/**
	 * Hide the modal
	 */
	function hideModal(callback){
		callback = callback || function(){};
		$('.trip-wizard-modal-mask, .trip-wizard-modal').fadeOut(callback);
	}

	/**
	 * Show the modal
	 */
	function showModal(){
		stepsManager.setStepIndex(0);
		setModalContent();
		$('.trip-wizard-modal-mask, .trip-wizard-modal').fadeIn();
	}

	/**
	 * Get modal content
	 */
	function setModalContent(){
		//Replace modal content with new one
		$('.js-trip-wizard-modal-dynamic-content')
		.empty()
		.append(stepsManager.getCurrentStep());

		//Notify stepManager that the new content was set 
		stepsManager.stepChanged();

		//Check if navigation buttons should be displayed
		$('.js-trip-wizard-modal-prev').hide();
		$('.js-trip-wizard-modal-next').hide();
		$('.js-trip-wizard-modal-finish').hide();
		if(stepsManager.hasPrevious()){
			$('.js-trip-wizard-modal-prev').show();
		}
		if(stepsManager.hasNext()){
			$('.js-trip-wizard-modal-next').show();
		}else {
			$('.js-trip-wizard-modal-finish').show();
		}
		
	}

	/**
	 * Swipe out to the left - to show the next modal screen
	 */
	function swipeLeftOut(callback){
		$('.trip-wizard-modal').animate(
			{
				left:'-100%'
			}, function(){
				//Change content and then swipe in the next screen
				callback && callback();
				swipeRightIn();
			}
		);
	}

	/**
	 * Swipe right in to bring the next modal screen 
	 */
	function swipeRightIn(){
		$('.trip-wizard-modal').css({left:'150%'}).animate(
			{
				left:'50%'
			}
		);
	}

	/**
	 * Swipe out to the right - to show the previous modal screen
	 */
	function swipeRightOut(callback){
		$('.trip-wizard-modal').animate(
			{
				left:'150%'
			}, function(){
				//Change content and then swipe in the next screen
				callback && callback();
				swipeLeftIn();
			})
	}

	/**
	 * Swipe left in to bring the previous modal screen
	 */
	function swipeLeftIn(){
		$('.trip-wizard-modal').css({left:'-100%'}).animate(
			{
				left:'50%'
			}, function(){
				//Notify modal active
			})
	}

	/**
	 * Show next modal screen
	 */
	function goNext(){
		if(stepsManager.validate()){
			swipeLeftOut(function(){
				stepsManager.getNextStep();
				setModalContent();
			});
		}
	}

	/**
	 * Show previous modal screen
	 */
	function goBack(){
		swipeRightOut(function(){
			stepsManager.getPreviousStep();
			setModalContent();
		});
	}

	/**
	 * Bring modal back to center
	 */
	function resetModalPosition(){
		$('.trip-wizard-modal').css({left:'50%'})
	}

	function showLoader(){
		$('.trip-wizard-loader').show();
	}

	function hideLoader(){
		$('.trip-wizard-loader').hide();
	}

	function finish(){
		if(stepsManager.validate()){
			$('.trip-wizard-modal').animate({left:'-100%'},
				//Emulate loading data 
				function(){
					showLoader();
					window.setTimeout(function(){
						hideLoader();
						hideModal(function(){
							stepsManager.setStepIndex(0);
							resetModalPosition();

							//Show result on main content
							$('.js-trip-wizard-result').empty().append(stepsManager.getResults());
						});
					},1000);
				}
			);
		}
	}

	/**
	 * Using the command pattern
	 */
	var clickEventDelegationHandlers = {
		'js-trip-wizard-modal-hide':hideModal,
		'js-trip-wizard-modal-show':showModal,
		'js-trip-wizard-modal-next':goNext,
		'js-trip-wizard-modal-prev':goBack,
		'js-trip-wizard-modal-finish':finish
	}

	/**
	 * Deside which callback to run depanding on the event target class
	 * @param  {event object} event - The event object returned from the event listener
	 */
	function clickDelegator(event){
		var classes = event.target.className.split(" ");
		for(var i = 0, len = classes.length; i < len; i++){
			if(clickEventDelegationHandlers[classes[i]]){
				clickEventDelegationHandlers[classes[i]].call(event.target);
			}
		}
	}

	/**
	 * Cancel any previouse event listener related to trip-wizard-modal
	 */
	$(document).off('click.trip-wizard-modal');

	/**
	 * Add an event listener to the document, so we can delegate the event using the event target. 
	 */
	$(document).on('click.trip-wizard-modal', clickDelegator);

	/**
	 * Set the initial content of the modal
	 */
	setModalContent();

	/**
	 * For the sake of example we'll show the modal on page load
	 */
	showModal();
}(jQuery, TripWizard.stepsManager));