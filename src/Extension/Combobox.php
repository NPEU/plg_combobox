<?php
/**
 * @package     Joomla.Plugin
 * @subpackage  System.Combobox
 *
 * @copyright   Copyright (C) NPEU 2026.
 * @license     MIT License; see LICENSE.md
 */

namespace NPEU\Plugin\System\Combobox\Extension;

\defined('_JEXEC') or die;

use Joomla\CMS\Event\Plugin\AjaxEvent;
use Joomla\CMS\Factory;
use Joomla\CMS\Plugin\CMSPlugin;
use Joomla\Event\Event;
use Joomla\Event\SubscriberInterface;


use Joomla\CMS\Log\Log;

Log::addLogger(
    array('text_file' => 'debug-combobox.php'),
    Log::ALL,
    array('plg_combobox') // change to your component/plugin name
);


/**
 * JS-based combo box for a Joomla custom text field.
 */
class Combobox extends CMSPlugin implements SubscriberInterface
{
    protected $autoloadLanguage = true;

    /**
     * An internal flag whether plugin should listen any event.
     *
     * @var bool
     *
     * @since   4.3.0
     */
    protected static $enabled = false;

    /**
     * Constructor
     *
     */
    public function __construct($subject, array $config = [], bool $enabled = true)
    {
        // The above enabled parameter was taken from the Guided Tour plugin but it always seems
        // to be false so I'm not sure where this param is passed from. Overriding it for now.
        $enabled = true;


        #$this->loadLanguage();
        $this->autoloadLanguage = $enabled;
        self::$enabled          = $enabled;

        parent::__construct($subject, $config);
    }

    /**
     * function for getSubscribedEvents : new Joomla 4 feature
     *
     * @return array
     *
     * @since   4.3.0
     */
    public static function getSubscribedEvents(): array
    {
        return self::$enabled ? [
            'onAjaxCombobox'       => 'onAjaxCombobox',
            'onBeforeRender'       => 'onBeforeRender',
        ] : [];
    }


    /**
     * Add CSS and JS for admin.
     */
    public function onBeforeRender(Event $event): void
    {
        $app = Factory::getApplication();

        if ($app->isClient('administrator')) {
            return; // Don't run in admin
        }

        $option = $app->input->get('option');
        //Log::add('option: ' . print_r($option, true), \Joomla\CMS\Log\Log::INFO, 'plg_combobox');

        /*$option = $app->input->get('option');
        if (! ($option == 'com_menus' || $option == 'com_modules')) {
            return; // Only run in com_menus and com_modules
        }*/

        $dir = str_replace(JPATH_ROOT, '', dirname(dirname(__DIR__)));
        $document = Factory::getDocument();

        $document->addStyleSheet($dir . '/assets/css/combobox.css');

        $document->addScript($dir . '/assets/js/accessible-autocomplete.min.js');
        $document->addScript($dir . '/assets/js/combobox.js');
    }


    /**
     * AJAX endpoint used by com_ajax
     * URL: index.php?option=com_ajax&plugin=combobox&group=fields&format=json&field_id=...&q=...
     */
    public function onAjaxCombobox(AjaxEvent $event)
    {
        $app   = Factory::getApplication();
        $input = $app->input;

        // action param (use 'action' so it's clear it's our router)
        $action = $input->getCmd('action', 'options');

        // allow caller to request JSON explicitly
        $format = $input->getCmd('format', '');

        // Basic ACL: restrict admin actions to authorised users
        $user = Factory::getUser();


        // route to internal handlers (if only 1 action can place it directly in here instead)
        switch ($action) {

            case 'options':
                // public options endpoint (returns JSON list of options for a field)
                return $this->handleOptionsList($format);

            default:
                return $this->ajaxResponse(['error' => 'Unknown action'], 400, $format);
        }

        /*
        // route to internal handlers
        switch ($action) {
            case 'adminList':
                // admin list should be limited to authorized users (administrator)
                if (!$user->authorise('core.manage')) {
                    return $this->ajaxResponse(['error' => 'Unauthorized'], 403, $format);
                }
                return $this->handleAdminList($format);

            case 'adminDelete':
                if (!$user->authorise('core.manage')) {
                    return $this->ajaxResponse(['error' => 'Unauthorized'], 403, $format);
                }

                // CSRF protection: ensure POST and valid token for state change
                if ($app->input->getMethod() !== 'POST' || !Session::checkToken()) {
                    return $this->ajaxResponse(['error' => 'Invalid token'], 403, $format);
                }
                return $this->handleAdminDelete($format);

            case 'options':
                // public options endpoint (returns JSON list of options for a field)
                return $this->handleOptionsList($format);

            default:
                return $this->ajaxResponse(['error' => 'Unknown action'], 400, $format);
        }*/
    }


    protected function handleOptionsList(string $format)
    {
        // Public endpoint used by front-end combobox (prefetch)
        $input   = Factory::getApplication()->input;
        $field_name = $input->getString('field_name', '');
        #Log::add('field_name: ' . print_r($field_name, true), \Joomla\CMS\Log\Log::INFO, 'plg_combobox');
        // Get the field ID from the name:

        $db = Factory::getDbo();
        $q = $db->getQuery(true)
            ->select($db->quoteName('id'))
            ->from($db->quoteName('#__fields'))
            ->where($db->quoteName('name') . ' = ' . $db->quote($field_name));

        $db->setQuery($q);
        $field_id = $db->loadResult();
        #Log::add('query: ' . print_r((string) $q, true), \Joomla\CMS\Log\Log::INFO, 'plg_combobox');
        #Log::add('field_id: ' . print_r($field_id, true), \Joomla\CMS\Log\Log::INFO, 'plg_combobox');

        $db = Factory::getDbo();
        $q = $db->getQuery(true)
            ->select('DISTINCT ' . $db->quoteName('value'))
            ->from($db->quoteName('#__fields_values'))
            ->where($db->quoteName('field_id') . ' = ' . (int) $field_id)
            ->order($db->quoteName('value') . ' ASC');

        $db->setQuery($q);
        $rows = $db->loadColumn();
        #Log::add('rows: ' . print_r($rows, true), \Joomla\CMS\Log\Log::INFO, 'plg_combobox');
        return $this->ajaxResponse(['results' => $rows], 200, 'json');
    }


    /**
     * Standard JSON/HTML responder
     */
    protected function ajaxResponse($payload, int $httpCode = 200, string $format = '')
    {
        $app = Factory::getApplication();

        if ($format === 'json' || $app->input->getCmd('format') === 'json') {
            $app->setHeader('Content-Type', 'application/json', true);
            http_response_code($httpCode);
            echo json_encode($payload, JSON_UNESCAPED_SLASHES);
            $app->close();
        }

        // fallback: if payload is HTML string, output it (compat)
        if (is_string($payload)) {
            echo $payload;
            $app->close();
        }

        // otherwise return JSON by default
        $app->setHeader('Content-Type', 'application/json', true);
        http_response_code($httpCode);
        echo json_encode($payload, JSON_UNESCAPED_SLASHES);
        $app->close();
    }
}